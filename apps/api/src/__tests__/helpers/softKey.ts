import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto"

/**
 * A software WebAuthn authenticator for tests: an ES256 key pair that builds real
 * "none"-attestation registrations and signed assertions, so the server's verification
 * runs for real (nothing is mocked).
 */

// --- a tiny CBOR encoder: just what an attestation object needs -------------------------------
type Cbor = number | string | Uint8Array | Cbor[] | Map<Cbor, Cbor>

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n])
  if (n < 256) return Buffer.from([(major << 5) | 24, n])
  if (n < 65_536) return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff])
  throw new Error("too large for this encoder")
}

function cbor(value: Cbor): Buffer {
  if (typeof value === "number") {
    return value >= 0 ? head(0, value) : head(1, -1 - value)
  }
  if (typeof value === "string") {
    const b = Buffer.from(value)
    return Buffer.concat([head(3, b.length), b])
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), Buffer.from(value)])
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)])
  const parts: Buffer[] = [head(5, value.size)]
  for (const [k, v] of value) parts.push(cbor(k), cbor(v))
  return Buffer.concat(parts)
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url")
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest()

export function createSoftKey(opts: { rpID: string; origin: string }) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
  const jwk = publicKey.export({ format: "jwk" })
  const credentialId = randomBytes(32)
  let counter = 0

  const cose = cbor(
    new Map<Cbor, Cbor>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, Buffer.from(jwk.x ?? "", "base64url")],
      [-3, Buffer.from(jwk.y ?? "", "base64url")],
    ]),
  )
  const rpIdHash = sha256(opts.rpID)
  const u32 = (n: number) => {
    const b = Buffer.alloc(4)
    b.writeUInt32BE(n)
    return b
  }
  const clientData = (type: string, challenge: string, origin = opts.origin) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

  return {
    id: b64u(credentialId),

    /** The browser's answer to navigator.credentials.create(options). */
    register(options: { challenge: string }, origin?: string) {
      const authData = Buffer.concat([
        rpIdHash,
        Buffer.from([0x41]), // user present + attested credential data
        u32(counter),
        Buffer.alloc(16), // aaguid
        Buffer.from([credentialId.length >> 8, credentialId.length & 0xff]),
        credentialId,
        cose,
      ])
      const attestationObject = cbor(
        new Map<Cbor, Cbor>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ]),
      )
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: "public-key" as const,
        response: {
          clientDataJSON: b64u(clientData("webauthn.create", options.challenge, origin)),
          attestationObject: b64u(attestationObject),
          transports: ["usb"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "cross-platform",
      }
    },

    /** The browser's answer to navigator.credentials.get(options). */
    assert(
      options: { challenge: string },
      over: { origin?: string; counter?: number; rpID?: string; sign?: boolean } = {},
    ) {
      counter = over.counter ?? counter + 1
      const authData = Buffer.concat([
        over.rpID ? sha256(over.rpID) : rpIdHash,
        Buffer.from([0x01]), // user present
        u32(counter),
      ])
      const clientDataJSON = clientData("webauthn.get", options.challenge, over.origin)
      const signature =
        over.sign === false
          ? randomBytes(70)
          : sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), privateKey)
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: "public-key" as const,
        response: {
          clientDataJSON: b64u(clientDataJSON),
          authenticatorData: b64u(authData),
          signature: b64u(signature),
        },
        clientExtensionResults: {},
        authenticatorAttachment: "cross-platform",
      }
    },
  }
}
