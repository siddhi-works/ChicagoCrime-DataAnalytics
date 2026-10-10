"""Tiny JSON-Schema -> TypeScript generator (no node needed)."""


def _ts(s, defs):
    if "$ref" in s:
        return s["$ref"].split("/")[-1]
    if "enum" in s:
        return " | ".join(repr(v).replace("'", '"') for v in s["enum"])
    if "const" in s:
        return repr(s["const"]).replace("'", '"')
    if "anyOf" in s:
        return " | ".join(_ts(x, defs) for x in s["anyOf"])
    t = s.get("type")
    if t == "array":
        return f"Array<{_ts(s.get('items', {}), defs)}>"
    if t == "object":
        if "properties" in s:
            req = set(s.get("required", []))
            body = "; ".join(f'{k}{"" if k in req else "?"}: {_ts(v, defs)}' for k, v in s["properties"].items())
            return "{ " + body + " }"
        ap = s.get("additionalProperties")
        return f"Record<string, {_ts(ap, defs) if isinstance(ap, dict) and ap else 'any'}>"
    return {"string": "string", "integer": "number", "number": "number", "boolean": "boolean", "null": "null"}.get(t, "any")


def schema_to_ts(name, schema):
    defs = schema.get("$defs", {})
    out = []
    for dn, d in defs.items():
        out.append(_decl(dn, d, defs))
    out.append(_decl(name, schema, defs))
    return "\n\n".join(out)


def _decl(name, s, defs):
    desc = s.get("description")
    head = f"/** {desc} */\n" if desc else ""
    if s.get("type") == "object" and "properties" in s:
        req = set(s.get("required", []))
        lines = []
        for k, v in s["properties"].items():
            d = v.get("description")
            if d:
                lines.append(f"  /** {d} */")
            lines.append(f'  {k}{"" if k in req else "?"}: {_ts(v, defs)};')
        return head + f"export interface {name} {{\n" + "\n".join(lines) + "\n}"
    return head + f"export type {name} = {_ts(s, defs)};"
