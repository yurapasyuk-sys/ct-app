import base64
import gzip
import io
import json
import ssl
import urllib.request

url = "https://blockworks.com/_next/data/jt9EoSNkTur_vR9PjiwZ0/analytics/meteora/meteora-financials.json?slug=meteora&slug=meteora-financials"

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "x-nextjs-data": "1",
}

req = urllib.request.Request(url, headers=headers)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

with urllib.request.urlopen(req, context=ctx) as response:
    data = json.loads(response.read().decode("utf-8"))

    page_props = data.get("pageProps", {})
    compressed_blob = page_props.get("content", {}).get("preloadedDataProp")

    if not compressed_blob:
        compressed_blob = page_props.get("preloadedDataProp")

    if not compressed_blob:
        print("Error: preloadedDataProp not found")
        if "content" in page_props:
            print("Keys in content:", list(page_props["content"].keys()))
        exit(1)

    decoded_data = base64.b64decode(compressed_blob)
    with gzip.GzipFile(fileobj=io.BytesIO(decoded_data)) as f:
        decompressed_data = f.read()

    full_data = json.loads(decompressed_data)

    target_title = "Meteora: Revenue"
    found_chart = None

    if isinstance(full_data, list):
        for chart in full_data:
            if chart.get("title") == target_title:
                found_chart = chart
                break

    if found_chart:
        # We need the execution rows to process data
        # Printing last 7 rows
        rows = found_chart.get("execution", {}).get("rows", [])
        print(json.dumps(rows[-7:], indent=2))
    else:
        print(f"Chart with title '{target_title}' not found.")
        if isinstance(full_data, list):
            print("Available titles:")
            for chart in full_data:
                print(f"- {chart.get('title')}")
