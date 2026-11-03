"""Rasterize the pinned, quadratic-only Material Symbol without changing its geometry."""
from pathlib import Path
import hashlib
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
source = (ROOT / "deployed_code_24px.svg").read_bytes()
assert hashlib.sha256(source).hexdigest() == "66e8b330ee102b6860f6de043e7a79ab278e3ac610cd99f5ea59633d526ac3c7"
svg = ET.fromstring(source)
assert svg.attrib["viewBox"] == "0 -960 960 960"
data = svg.find("{http://www.w3.org/2000/svg}path").attrib["d"]
parts = re.findall(r"[A-Za-z]|-?(?:\d*\.\d+|\d+)", data)
polygons, polygon = [], []
i, command, current, start, control = 0, None, (0.0, 0.0), None, None

def pair():
    global i
    point = (float(parts[i]), float(parts[i + 1]))
    i += 2
    return point

def endpoint(point, relative):
    return (point[0] + current[0], point[1] + current[1]) if relative else point

while i < len(parts):
    if parts[i].isalpha():
        command = parts[i]
        i += 1
    assert command and command.upper() in "MLHVQTZ", "Unexpected SVG command; review the source instead of approximating it"
    op, relative = command.upper(), command.islower()
    if op == "Z":
        if polygon:
            polygons.append(polygon)
        polygon, current, control, command = [], start, None, None
    elif op == "M":
        if polygon:
            polygons.append(polygon)
        current = endpoint(pair(), relative)
        polygon, start, control = [current], current, None
        command = "l" if relative else "L"
    elif op == "L":
        current = endpoint(pair(), relative)
        polygon.append(current)
        control = None
    elif op in "HV":
        value = float(parts[i]); i += 1
        axis = 0 if op == "H" else 1
        point = list(current)
        point[axis] = value + current[axis] if relative else value
        current = tuple(point)
        polygon.append(current)
        control = None
    else:
        middle = endpoint(pair(), relative) if op == "Q" else ((2 * current[0] - control[0], 2 * current[1] - control[1]) if control else current)
        end = endpoint(pair(), relative)
        begin = current
        for sample in range(1, 33):
            t = sample / 32
            polygon.append(tuple((1-t)**2 * begin[a] + 2*(1-t)*t*middle[a] + t*t*end[a] for a in (0, 1)))
        current, control = end, middle
if polygon:
    polygons.append(polygon)

def area(points):
    return sum(a[0]*b[1] - b[0]*a[1] for a, b in zip(points, points[1:] + points[:1])) / 2

polygons = [points for points in polygons if len(points) >= 3 and abs(area(points)) > 1]
assert len(polygons) == 4, "Expected one outline and three interior faces"
outer = max(polygons, key=lambda points: abs(area(points)))
orientation = 1 if area(outer) > 0 else -1
mask = Image.new("L", (1024, 1024), 0)
draw = ImageDraw.Draw(mask)
for points in sorted(polygons, key=lambda points: abs(area(points)), reverse=True):
    fill = 255 if area(points) * orientation > 0 else 0
    draw.polygon([(x * 1024 / 960, (y + 960) * 1024 / 960) for x, y in points], fill=fill)
image = Image.new("RGBA", (1024, 1024), "#526600")
image.putalpha(mask)
image = image.resize((256, 256), Image.Resampling.LANCZOS)
image.save(ROOT / "icon.png")
image.save(ROOT / "icon.ico", sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)])
print("Generated the pinned deployed_code symbol in the reference light-theme primary color.")
