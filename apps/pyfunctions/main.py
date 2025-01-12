import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import TypedDict

import functions_framework
import pytz
from google.cloud import secretmanager, storage
from tbapy import TBA

_api_key = None


OPPOSITE_COLOR = {
    "red": "blue",
    "blue": "red",
}


logging.getLogger().setLevel(logging.INFO)


def match_sorter(match, event):
    if match["actual_time"] is not None:
        return match["actual_time"]

    # Parse event's end_date and timezone
    end_date = datetime.strptime(event["end_date"], "%Y-%m-%d")
    if "timezone" in event and event["timezone"]:
        local_tz = pytz.timezone(event["timezone"])
    else:
        local_tz = pytz.timezone("America/New_York")

    # Set the time to noon and convert to Unix timestamp in the local timezone
    end_date_noon = local_tz.localize(
        end_date.replace(hour=12, minute=0, second=0, microsecond=0)
    )
    return int(end_date_noon.timestamp())


class ScorigamiResponseObj(TypedDict):
    winning_score: int
    losing_score: int
    count: int
    first: str
    last: str


@dataclass
class MatchEvent:
    match: dict
    event: dict


@dataclass
class ScorigamiOrganizer:
    winning_score: int
    losing_score: int
    match_events: list[MatchEvent]

    def to_dict(self) -> ScorigamiResponseObj:
        return ScorigamiResponseObj(
            winning_score=self.winning_score,
            losing_score=self.losing_score,
            count=len(self.match_events),
            first=self.match_events[0].match["key"],
            last=self.match_events[-1].match["key"],
        )

    def sort_matches(self) -> None:
        self.match_events.sort(key=lambda x: match_sorter(x.match, x.event))


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


def generate_scorigami_data(tba_key: str, year: int):
    tba = TBA(tba_key)
    scorigamis = {}
    events = tba.events(year=year, simple=True)
    logging.info("Processing events")
    for event in events:
        logging.info(f"Processing event {event['key']}")
        if event["event_type"] in [99, 100, -1]:
            logging.info(f"Skipping {event['key']}")
            continue

        matches = tba.event_matches(event["key"], simple=True)
        for match in matches:
            if match["winning_alliance"] == "" or match["winning_alliance"] is None:
                match["winning_alliance"] = "red"
                logging.debug(f"Match {match['key']} has no winner, setting to red")

            winning_score = match["alliances"][match["winning_alliance"]]["score"]
            losing_score = match["alliances"][
                OPPOSITE_COLOR[match["winning_alliance"]]
            ]["score"]

            if (winning_score, losing_score) not in scorigamis:
                scorigamis[(winning_score, losing_score)] = ScorigamiOrganizer(
                    winning_score=winning_score,
                    losing_score=losing_score,
                    match_events=[],
                )

            scorigamis[(winning_score, losing_score)].match_events.append(
                MatchEvent(match=match, event=event)
            )

    for scorigami in scorigamis.values():
        scorigami.sort_matches()

    print(f"Found {len(scorigamis)} scorigamis")
    return sorted(
        [scorigami.to_dict() for scorigami in scorigamis.values()],
        key=lambda s: (-s["count"], -(s["winning_score"] + s["losing_score"])),
    )


@functions_framework.http
def update(request):
    path = request.path
    year = int(path.split("/")[-1])

    storage_client = storage.Client()
    bucket = storage_client.bucket(os.environ.get("BUCKET_NAME"))
    tba_key = get_api_key()
    data = generate_scorigami_data(tba_key, year)

    data = {"last_updated": datetime.now().isoformat(), "data": data}

    blob = bucket.blob(f"scorigami_{year}.json")
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
    path = request.path
    year = int(path.split("/")[-1])
    return {"data": generate_scorigami_data(get_api_key(), year)}


@functions_framework.http
def get(request):
    path = request.path
    year = int(path.split("/")[-1])

    # Initialize storage client
    storage_client = storage.Client()
    bucket = storage_client.bucket(os.environ.get("BUCKET_NAME"))

    # Read blob
    blob = bucket.blob(f"scorigami_{year}.json")
    data = json.loads(blob.download_as_string())

    # Add CORS headers and return data
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Content-Type": "application/json",
    }

    return (data, 200, headers)
