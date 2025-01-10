import json
import logging
import os
from collections import defaultdict
from datetime import datetime

import functions_framework
from google.cloud import secretmanager, storage
from tbapy import TBA

# Cache for API key
_api_key = None


OPPOSITE_COLOR = {
    "red": "blue",
    "blue": "red",
}


def get_api_key():
    global _api_key
    if _api_key is not None:
        return _api_key

    if os.environ.get("LOCAL_KEY"):
        _api_key = os.environ.get("LOCAL_KEY")
        return _api_key

    client = secretmanager.SecretManagerServiceClient()
    name = os.environ.get("TBA_API_KEY")
    response = client.access_secret_version(request={"name": name})
    _api_key = response.payload.data.decode("UTF-8").strip()
    return _api_key


def generate_scorigami_data(tba_key: str):
    tba = TBA(tba_key)

    # Get all FRC events for current year
    year = datetime.now().year - 1
    events = tba.events(year=year, keys=True)
    unique_scores = defaultdict(list)

    logging.info("Processing events")
    for event in events:
        logging.info(f"Processing event {event}")
        matches = tba.event_matches(event, simple=True)
        for match in matches:
            logging.info(f"Processing match {match['key']}")

            if match["winning_alliance"] == "" or match["winning_alliance"] is None:
                match["winning_alliance"] = "red"
                logging.debug(f"Match {match['key']} has no winner, setting to red")

            winning_score = match["alliances"][match["winning_alliance"]]["score"]
            losing_score = match["alliances"][
                OPPOSITE_COLOR[match["winning_alliance"]]
            ]["score"]

            unique_scores[(winning_score, losing_score)].append(match["key"])

    return [
        {
            "winning_score": k[0],
            "losing_score": k[1],
            "first": v[0],
            "last": v[-1],
            "count": len(v),
        }
        for k, v in unique_scores.items()
    ]


@functions_framework.http
def update(request):
    # Initialize clients
    storage_client = storage.Client()
    bucket = storage_client.bucket(os.environ.get("BUCKET_NAME"))
    tba_key = get_api_key()
    data = generate_scorigami_data(tba_key)

    data = {"last_updated": datetime.now().isoformat(), "data": data}

    blob = bucket.blob("scorigami.json")
    blob.upload_from_string(
        json.dumps(data, indent=2),
        content_type="application/json",
    )

    return {
        "success": True,
        "timestamp": datetime.now().isoformat(),
    }


@functions_framework.http
def update_local(request):
    return {"data": generate_scorigami_data(get_api_key())}


@functions_framework.http
def get(request):
    # Initialize storage client
    storage_client = storage.Client()
    bucket = storage_client.bucket(os.environ.get("BUCKET_NAME"))

    # Read blob
    blob = bucket.blob("scorigami.json")
    data = json.loads(blob.download_as_string())

    # Add CORS headers and return data
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Content-Type": "application/json",
    }

    return (data, 200, headers)
