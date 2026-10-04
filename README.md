# qq_snowgraveapi

An API for QQ bot.

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
https://player233-api.onrender.com/qq/v1/img/dr/snowgrave?qq={number}
```

or

```text
http://127.0.0.1:1225/qq/v1/img/dr/snowgrave?qq={number}
```

Replace `{number}` with the QQ number.

Example:

```bash
curl -o result.gif "https://player233-api.onrender.com/qq/v1/img/dr/snowgrave?qq=12251997"
```

```python
import requests

url = "https://player233-api.onrender.com/qq/v1/img/dr/snowgrave"
params = {"qq": "12251997"}

response = requests.get(url, params=params)
response.raise_for_status()

with open("result.gif", "wb") as f:
    f.write(response.content)
```

```html
<img src="https://player233-api.onrender.com/qq/v1/img/dr/snowgrave?qq=12251997" alt="QQ GIF">
```

Or open it directly in your browser:

```text
https://player233-api.onrender.com/qq/v1/img/dr/snowgrave?qq=12251997
```

The API returns an `image/gif` response.

# Web Generator

We provide an online website to generate the GIF. You can visit:

*[QQ Snowgrave API Web Generator](https://player233lol.github.io/qq_snowgraveapi/html/)*

Enter a QQ number and generate the GIF directly in your browser.
