import xml.etree.ElementTree as ET
import json
tree = ET.parse('assets/kazakhstan-map.svg')
root = tree.getroot()
mapping = {}
for child in root:
    if child.tag.endswith('path'):
        name = child.attrib.get('data-name', '')
        id_ = child.attrib.get('data-id', '')
        mapping[id_] = name
with open('mapping.json', 'w', encoding='utf-8') as f:
    json.dump(mapping, f, ensure_ascii=False)
