"""Export only this site's aggregate Cloudflare RUM metrics. No third-party packages."""
import json
import math
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HOST = "zihangzou.github.io"
ENDPOINT = "https://api.cloudflare.com/client/v4/graphql"


def query(account, start, end):
    if not re.fullmatch(r"[a-fA-F0-9]{32}", account):
        raise ValueError("CF_ACCOUNT_ID must be the 32-character Cloudflare account ID.")
    # Exact host filter prevents other sites in the same account appearing in this report.
    f = ("{datetime_geq: " + json.dumps(start) + ", datetime_lt: " + json.dumps(end)
         + ", requestHost: " + json.dumps(HOST) + ', requestPath_neq: "/usage.html"}')
    def group(alias, dimension=None, limit=20, filter_text=f):
        dims = "dimensions { " + dimension + " }" if dimension else ""
        order = "date_ASC" if dimension == "date" else "count_DESC"
        return (f"{alias}: rumPageloadEventsAdaptiveGroups(limit: {limit}, filter: {filter_text}, "
                f"orderBy: [{order}]) {{ count sum {{ visits }} {dims} }}")
    groups = [group("totals", limit=1), group("daily", "date", 31),
              group("pages", "requestPath", 20), group("countries", "countryName", 300),
              group("referrers", "refererHost", 20), group("devices", "deviceType", 30),
              group("neural", limit=1, filter_text=f[:-1] + ', requestPath: "/papers/neural-plagiarism/"}')]
    return "query { viewer { accounts(filter: {accountTag: " + json.dumps(account) + "}) { " + "\n".join(groups) + " } } }"


def fetch(token, document):
    request = Request(ENDPOINT, data=json.dumps({"query": document}).encode(),
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=45) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"Cloudflare HTTP {exc.code}; check analytics-read permissions and credentials.") from None
    except URLError:
        raise RuntimeError("Cloudflare could not be reached; existing snapshot preserved.") from None
    if payload.get("errors"):
        # Do not print account IDs, query variables or raw provider responses in public Action logs.
        raise RuntimeError("Cloudflare GraphQL rejected the query. Check account access, dataset fields and time-range limits; existing snapshot preserved.")
    accounts = payload.get("data", {}).get("viewer", {}).get("accounts", [])
    if len(accounts) != 1:
        raise RuntimeError("Cloudflare account unavailable; check CF_ACCOUNT_ID and token scope.")
    return accounts[0]


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError("Cloudflare returned an invalid count.")
    return value


def metric(rows, field="views"):
    if not isinstance(rows, list):
        raise ValueError("Cloudflare returned an incomplete metric.")
    return sum(number(row["count"] if field == "views" else row["sum"]["visits"]) for row in rows)


def breakdown(rows, field):
    if not isinstance(rows, list):
        raise ValueError("Cloudflare returned an incomplete breakdown.")
    result = []
    for row in rows:
        label = str(row["dimensions"].get(field) or ("Direct / unknown" if field == "refererHost" else "Unknown"))
        # Keep only the requested aggregate dimension, never query strings, IPs or raw events.
        label = label.split("?", 1)[0].split("#", 1)[0][:256]
        result.append({"label": label, "views": number(row["count"])})
    return result


def window(data, start, end):
    required = {"totals", "daily", "pages", "countries", "referrers", "devices", "neural"}
    if not required.issubset(data) or any(not isinstance(data[k], list) for k in required):
        raise ValueError("Cloudflare response is incomplete; existing snapshot preserved.")
    dates = {}
    for row in data["daily"]:
        day = row["dimensions"]["date"]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            raise ValueError("Invalid daily date.")
        dates[day] = {"date": day, "views": number(row["count"]), "visits": number(row["sum"]["visits"])}
    daily = []
    day = datetime.fromisoformat(start.replace("Z", "+00:00"))
    until = datetime.fromisoformat(end.replace("Z", "+00:00"))
    while day < until:
        key = day.date().isoformat()
        daily.append(dates.get(key, {"date": key, "views": 0, "visits": 0}))
        day += timedelta(days=1)
    return {"start": start, "end": end, "views": metric(data["totals"]),
            "visits": metric(data["totals"], "visits"), "neural_views": metric(data["neural"]), "daily": daily,
            **{key: breakdown(data[key], dimension) for key, dimension in
               [("pages", "requestPath"), ("countries", "countryName"), ("referrers", "refererHost"), ("devices", "deviceType")]}}


def main():
    token = os.environ.get("CF_API_TOKEN", "")
    account = os.environ.get("CF_ACCOUNT_ID", "")
    if not token or not account:
        raise ValueError("Set CF_API_TOKEN and CF_ACCOUNT_ID as repository Actions secrets first.")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    end = now.isoformat().replace("+00:00", "Z")
    windows = {}
    for days in [1, 7, 30]:
        start = (now.replace(hour=0, minute=0, second=0) - timedelta(days=days-1)).isoformat().replace("+00:00", "Z")
        windows[str(days)] = window(fetch(token, query(account, start, end)), start, end)
    result = {"schema_version": 1, "status": "ready", "site": HOST,
              "source": "Cloudflare Web Analytics", "updated_at": end, "windows": windows}
    target = Path(__file__).resolve().parents[1] / "usage-data.json"
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    temporary.replace(target)
    print("Updated aggregate usage snapshot for " + HOST)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, KeyError, TypeError) as error:
        print("Usage sync failed: " + str(error), file=sys.stderr)
        sys.exit(1)
