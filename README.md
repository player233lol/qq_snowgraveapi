# qq_snowgraveapi
an api for qq_bot

# QQ Snowgrave GIF API

## Requirements

- Python 3.8+
- fastapi
- uvicorn
- aiohttp
- pillow

## Installation

You need the following libraries:

- fastapi
- uvicorn
- aiohttp
- pillow

You can install them with pip:

```bash
pip install fastapi uvicorn aiohttp pillow
```
# Usage

To call the API, use:

```text
http://127.0.0.1:1225/qq/v1/img/dr/snowgrave?qq={number}
```

Replace `{number}` with the QQ number.

Example:

```bash
curl -o result.gif "http://127.0.0.1:1225/qq/v1/img/dr/snowgrave?qq=12251997"
```

```python
import requests

url = "http://127.0.0.1:1225/qq/v1/img/dr/snowgrave"
params = {"qq": "12251997"}

response = requests.get(url, params=params)
response.raise_for_status()

with open("result.gif", "wb") as f:
    f.write(response.content)
```

```html
<img src="http://127.0.0.1:1225/qq/v1/img/dr/snowgrave?qq=12251997" alt="QQ GIF">
```

Or open it directly in your browser:

```text
http://127.0.0.1:1225/qq/v1/img/dr/snowgrave?qq=12251997
```

The API returns an `image/gif` response.
