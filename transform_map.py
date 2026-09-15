import xml.etree.ElementTree as ET

name_mapping = {
    'Akmola': 'Акмолинская область',
    'Aktobe': 'Актюбинская область',
    'Almaty': 'Алматинская область',
    'Almaty (city)': 'г. Алматы',
    'Atyrau': 'Атырауская область',
    'Abai': 'Область Абай',
    'Jambyl': 'Жамбылская область',
    'Ulytau': 'Область Улытау',
    'Kostanay': 'Костанайская область',
    'Kyzylorda': 'Кызылординская область',
    'Mangystau': 'Мангистауская область',
    'North Kazakhstan': 'Северо-Казахстанская область',
    'Astana': 'г. Астана',
    'Pavlodar': 'Павлодарская область',
    'Shymkent (city)': 'г. Шымкент',
    'Turkestan': 'Туркестанская область',
    'West Kazakhstan': 'Западно-Казахстанская область',
    'Karaganda': 'Карагандинская область',
    'Jetisu': 'Область Жетысу',
    'East Kazakhstan': 'Восточно-Казахстанская область'
}

ET.register_namespace('', 'http://www.w3.org/2000/svg')
tree = ET.parse('kz.svg')
root = tree.getroot()

root.attrib['class'] = 'kz-map-svg'
root.attrib['role'] = 'img'
root.attrib['preserveAspectRatio'] = 'xMidYMid meet'
root.attrib['aria-label'] = 'Интерактивная карта Казахстана'

paths = root.findall('.//{http://www.w3.org/2000/svg}path')
for p in paths:
    en_name = p.attrib.get('name')
    if en_name in name_mapping:
        p.attrib['class'] = 'kz-region'
        p.attrib['data-name'] = name_mapping[en_name]
        p.attrib['data-id'] = en_name.lower().replace(' ', '-')
        
        # Add title
        title = ET.Element('title')
        title.text = name_mapping[en_name]
        p.append(title)
        
        # Remove old attribs
        if 'id' in p.attrib:
            del p.attrib['id']
        if 'name' in p.attrib:
            del p.attrib['name']

circles = root.findall('.//{http://www.w3.org/2000/svg}circle')
for c in circles:
    if 'class' in c.attrib:
        del c.attrib['class']
    if 'id' in c.attrib:
        del c.attrib['id']
    # Maybe add a subtle style to the circles so they look like city markers
    c.attrib['fill'] = '#ffffff'
    c.attrib['opacity'] = '0.5'

tree.write('assets/kazakhstan-map.svg', encoding='utf-8', xml_declaration=True)
