import re

with open('index.html', 'r') as f:
    content = f.read()

# Add meta description
content = content.replace(
    '<title>DriveLogicAI</title>',
    '<title>DriveLogicAI</title>\n    <meta name="description" content="DriveLogicAI is an advanced OBD2 vehicle diagnostic application that connects to your car to read live engine data, clear fault codes, and provide AI-powered repair assistance and maintenance tracking.">\n    <meta property="og:title" content="DriveLogicAI - Advanced OBD2 Diagnostics">'
)

# Add noscript fallback for bots
content = content.replace(
    '<div id="root"></div>',
    '<div id="root"></div>\n    <noscript>\n      <h1>DriveLogicAI</h1>\n      <p>DriveLogicAI is an advanced OBD2 vehicle diagnostic application that connects to your car to read live engine data, clear fault codes, and provide AI-powered repair assistance and maintenance tracking.</p>\n      <a href="/privacy.html">Privacy Policy</a> | <a href="/terms.html">Terms of Service</a>\n    </noscript>'
)

with open('index.html', 'w') as f:
    f.write(content)
