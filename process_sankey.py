import json

# Mappings
SOURCE_MAP = {
    "damm": "DAMM",
    "dammv1": "DAMM",
    "dammv2": "DAMM",
    "dlmm": "DLMM",
    "dbc": "DBC",
}

TARGET_MAP = {
    "memes": "Memes",
    "tokenizedassets": "Tokenized Assets",
    "projecttokens": "Project Tokens",
    "lstswaps": "LST Swaps",
    "nativestablecoin": "SOL-Stablecoin",
    "bitcoin": "Bitcoin",
    "compositetokens": "Composite Tokens",
    "aiagents": "AI Agents",
    "stablecoinswaps": "Stablecoin Swaps",
    "other": "Other",
    "compositeassets": "Composite Tokens",
}


def process():
    try:
        with open("sankey_rows.json", "r") as f:
            rows = json.load(f)
    except FileNotFoundError:
        print("Error: sankey_rows.json not found.")
        return

    # Accumulate totals
    flows = {}  # (Source, Target) -> Value

    for row in rows:
        for key, value in row.items():
            if not key.startswith("type_") or "revenue_usd" not in key:
                continue

            if value is None:
                value = 0

            # Parse key: type_{SOURCE}_category_{TARGET}_revenue_usd
            # Or type_{SOURCE}_revenue_usd (Total? ignore)

            parts = key.split("_")

            # Check format
            if "category" not in parts:
                continue

            try:
                cat_index = parts.index("category")
                source_part = "_".join(parts[1:cat_index])  # e.g. damm, dammv2
                target_part = "_".join(parts[cat_index + 1 : -2])  # e.g. memes

                source_name = SOURCE_MAP.get(source_part, source_part.upper())
                target_name = TARGET_MAP.get(target_part, target_part.title())

                if (source_name, target_name) not in flows:
                    flows[(source_name, target_name)] = 0

                flows[(source_name, target_name)] += value

            except ValueError:
                continue

    # Build Nodes and Links
    nodes_set = set()
    for s, t in flows.keys():
        nodes_set.add(s)
        nodes_set.add(t)

    # Sort nodes to keep sources on top/left visually usually works by index order,
    # but Recharts sankey logic is specific.
    # Let's put Sources first, then Targets.
    sources = sorted(list(set(s for s, t in flows.keys())))
    targets = sorted(list(set(t for s, t in flows.keys())))

    # Ensure no overlap (though typically source != target here)
    final_nodes_list = sources + [t for t in targets if t not in sources]

    node_indices = {name: i for i, name in enumerate(final_nodes_list)}

    nodes = [{"name": name} for name in final_nodes_list]
    links = []

    for (source, target), value in flows.items():
        if value > 0.01:  # Filter tiny amounts
            links.append(
                {
                    "source": node_indices[source],
                    "target": node_indices[target],
                    "value": value,
                }
            )

    output = {"nodes": nodes, "links": links}

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    process()
