export interface YamlCodec {
  parse(raw: string): unknown
  stringify(value: unknown): string
}

let codec: YamlCodec | undefined

/** The host supplies its YAML implementation so files serialize the same way it reads them. */
export function setYamlCodec(next: YamlCodec): void {
  codec = next
}

export function parseYaml(raw: string): unknown {
  if (!codec) throw new Error('YAML codec not configured; call setYamlCodec first')
  return codec.parse(raw)
}

export function stringifyYaml(value: unknown): string {
  if (!codec) throw new Error('YAML codec not configured; call setYamlCodec first')
  return codec.stringify(value)
}
