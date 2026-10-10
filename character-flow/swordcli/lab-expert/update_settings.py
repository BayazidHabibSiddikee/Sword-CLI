import json

with open('/home/sword/Documents/LAB_Expert/labgen/settings.json', 'r') as f:
    data = json.load(f)

data['llm']['base_url'] = 'https://router.bynara.id/v1'

with open('/home/sword/Documents/LAB_Expert/labgen/settings.json', 'w') as f:
    json.dump(data, f, indent=2)
