terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.34.0"
    }
  }
}

provider "google" {
  project = "frc-scorigami"
  region  = "us-central1" # Set your desired region here
}

data "google_project" "project" {
  project_id = "frc-scorigami"
}

resource "random_id" "default" {
  byte_length = 8
}

# Create the bucket to store cloud function source code
resource "google_storage_bucket" "function_source" {
  name                        = "${random_id.default.hex}-gcf-source"
  location                    = "US"
  uniform_bucket_level_access = true
}

# Zip cloud function source code
data "archive_file" "default" {
  type        = "zip"
  output_path = "/tmp/function-source.zip"
  source_dir  = "apps/pyfunctions/"
  excludes    = ["venv", "venv/**", "apps/pyfunctions/venv/", "apps/pyfunctions/venv/**"]
}

# Upload the zipped source code to the bucket
resource "google_storage_bucket_object" "object" {
  name   = "function-${data.archive_file.default.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.default.output_path
}

# Create the cloud functions
resource "google_cloudfunctions2_function" "function" {
  for_each = toset(["function-update", "function-get"])

  name     = each.key
  location = "us-central1"

  build_config {
    runtime     = "python311"
    entry_point = each.key == "function-update" ? "update" : "get"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.object.name
      }
    }
  }

  service_config {
    max_instance_count = 1
    available_memory   = "512M"
    timeout_seconds    = each.key == "function-update" ? 600 : 60
    environment_variables = {
      BUCKET_NAME = google_storage_bucket.data_storage.name
      TBA_API_KEY = "projects/frc-scorigami/secrets/api-key/versions/latest"
    }
  }
}

# Grant the cloud functions invoker role to all users
resource "google_cloud_run_service_iam_member" "member" {
  for_each = google_cloudfunctions2_function.function

  location = each.value.location
  service  = each.value.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "function_uris" {
  value = {
    for f in google_cloudfunctions2_function.function : f.name => f.service_config[0].uri
  }
}

output "function_source_bucket_name" {
  value = google_storage_bucket.function_source.name
}


resource "google_storage_bucket" "data_storage" {
  name                        = "frc-scorigami-data-storage"
  location                    = "US"
  uniform_bucket_level_access = true
}


# Grant functions access to read secret for TBA key
resource "google_secret_manager_secret_iam_member" "function_secretAccessor" {
  for_each = google_cloudfunctions2_function.function

  project   = "frc-scorigami"
  secret_id = "api-key"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value.service_config[0].service_account_email}"
}

# Grant read-only access to get function
resource "google_storage_bucket_iam_member" "get_function_access" {
  bucket = google_storage_bucket.data_storage.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_cloudfunctions2_function.function["function-get"].service_config[0].service_account_email}"
}

# Grant read/write access to update function
resource "google_storage_bucket_iam_member" "update_function_access" {
  bucket = google_storage_bucket.data_storage.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_cloudfunctions2_function.function["function-update"].service_config[0].service_account_email}"
}

# Create scheduler job for update function
resource "google_cloud_scheduler_job" "update_job" {
  name      = "update-scorigami-data"
  schedule  = "0,10,20,30,40,50 * * * *"
  region    = "us-central1"
  time_zone = "America/New_York"

  http_target {
    http_method = "GET"
    uri         = "${google_cloudfunctions2_function.function["function-update"].service_config[0].uri}/2025"

    oidc_token {
      service_account_email = google_cloudfunctions2_function.function["function-update"].service_config[0].service_account_email
    }
  }
}

# Create artifact storage bucket
resource "google_storage_bucket" "frontend_storage" {
  name                        = "frc-scorigami-frontend"
  location                    = "US"
  uniform_bucket_level_access = true
}

# Create Cloud Run service for frontend
resource "google_cloud_run_service" "frontend" {
  name     = "scorigami-frontend"
  location = "us-central1"

  template {
    spec {
      containers {
        image = "gcr.io/frc-scorigami/frontend:latest"
        env {
          name  = "NEXT_PUBLIC_API_URL"
          value = google_cloudfunctions2_function.function["function-get"].service_config[0].uri
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

# Allow public access
resource "google_cloud_run_service_iam_member" "frontend_public" {
  location = google_cloud_run_service.frontend.location
  service  = google_cloud_run_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Grant Cloud Build service account access to push images
resource "google_project_iam_member" "cloud1build_gcr" {
  project = "frc-scorigami"
  role    = "roles/storage.admin"
  member  = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
}

# Create service account for Cloud Build
resource "google_service_account" "cloudbuild_sa" {
  account_id   = "cloudbuild-frontend"
  display_name = "Cloud Build Frontend"
}

# Grant necessary permissions
resource "google_project_iam_member" "cloudbuild_permissions" {
  for_each = toset([
    "roles/run.admin",
    "roles/storage.admin",
    "roles/cloudbuild.builds.builder",
    "roles/iam.serviceAccountUser"
  ])

  project = "frc-scorigami"
  role    = each.key
  member  = "serviceAccount:${google_service_account.cloudbuild_sa.email}"
}

# Create Cloud Build trigger
resource "google_cloudbuild_trigger" "frontend_build" {
  location = "global"
  name     = "build-frontend"

  github {
    owner = "frcscorigami"
    name  = "frcscorigami"
    push {
      branch = "^main$"
    }
  }

  substitutions = {
    _NEXT_PUBLIC_API_URL = google_cloudfunctions2_function.function["function-get"].service_config[0].uri
  }

  included_files  = ["apps/frontend/**"]
  filename        = "apps/frontend/cloudbuild.yaml"
  service_account = google_service_account.cloudbuild_sa.id
}
