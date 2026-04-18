import json

with open(
    "C:/laragon/www/local-llm/workflows/wan2.2-8gb vram_new.json", encoding="utf-8"
) as f:
    d = json.load(f)

for node in d["nodes"]:
    if node["type"] in [
        "KSamplerAdvanced",
        "ImageResizeKJv2",
        "WanImageToVideo",
        "SaveVideo",
    ]:
        print(f"Node {node['id']} ({node['type']}):")
        inputs = [i["name"] for i in node["inputs"]]
        print(f"  inputs: {inputs}")
        print(f"  widgets: {node['widgets_values']}")
        print()
