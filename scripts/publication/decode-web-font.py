"""Decode bounded font metadata. No publication policy enters this process."""
import io
import json
import struct
import sys
import fontTools
import brotli
from fontTools.ttLib import TTFont

try:
    if fontTools.__version__ != '4.63.0' or brotli.__version__ != '1.2.0':
        raise ValueError()
    raw = sys.stdin.buffer.read(16777217)
    if len(raw) < 48 or len(raw) > 16777216 or raw[:4] not in (b'wOF2', b'wOFF'):
        raise ValueError()
    if struct.unpack('>I', raw[8:12])[0] != len(raw) or struct.unpack('>I', raw[16:20])[0] > 16777216:
        raise ValueError()
    font = TTFont(io.BytesIO(raw), lazy=False, recalcBBoxes=False, recalcTimestamp=False)
    # Force all tables to decompress within the declared aggregate bound.
    if sum(len(font.getTableData(tag)) for tag in font.keys() if tag != 'GlyphOrder') > 16777216:
        raise ValueError()
    values = []
    if 'name' in font:
        for item in font['name'].names:
            values.append(item.toUnicode(errors='strict'))
    if 'meta' in font:
        for value in font['meta'].data.values():
            values.append(value.decode('utf-8', errors='strict') if isinstance(value, bytes) else value)
    if 'SVG ' in font:
        for document in font['SVG '].docList:
            values.append(document.data)
    # Container metadata and private trailing data must not escape inspection.
    if raw[:4] == b'wOF2':
        offsets = struct.unpack('>IIIII', raw[28:48])
    else:
        offsets = struct.unpack('>IIIII', raw[24:44])
    meta_offset, meta_length, meta_original, private_offset, private_length = offsets
    if meta_offset or meta_length or meta_original or private_offset or private_length:
        raise ValueError()
    output = json.dumps(values, ensure_ascii=True).encode('ascii')
    if len(values) > 4096 or len(output) > 2097152:
        raise ValueError()
    sys.stdout.buffer.write(output)
except Exception:
    sys.stderr.write('font-metadata-decoding-incomplete\n')
    sys.exit(2)
