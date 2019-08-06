import {
  binaryStringToUint8Array,
  uint8ArrayToHexadecimal,
  hexadecimalToBinaryString
} from '../types/convert'

/**
 * Length of a path to a terminal node in bits.
 *
 * @type {number}
 */
const BIT_LENGTH = 256

export default class ProofPath {
  /**
   * Constructs a proof path from a binary string or a byte buffer.
   *
   * @param {string | Uint8Array} bits
   * @param {number} bitLength?
   */
  constructor (bits, bitLength = BIT_LENGTH) {
    if (typeof bits === 'string') {
      this.key = binaryStringToUint8Array(padWithZeros(bits, BIT_LENGTH))
      bitLength = bits.length
    } else if (bits instanceof Uint8Array && bits.length === BIT_LENGTH / 8) {
      this.key = bits.slice(0)
    } else {
      throw new TypeError('Invalid `bits` parameter')
    }

    this.bitLength = bitLength
    this.hexKey = uint8ArrayToHexadecimal(this.key)
  }

  /**
   * Checks if this path corresponds to the terminal node / leaf in the Merkle Patricia tree.
   *
   * @returns {boolean}
   */
  isTerminal () {
    return this.bitLength === BIT_LENGTH
  }

  /**
   * Retrieves a bit at a specific position of this key.
   *
   * @param {number} pos
   * @returns {0 | 1 | void}
   */
  bit (pos) {
    pos = +pos
    if (pos >= this.bitLength || pos < 0) {
      return undefined
    }

    return getBit(this.key, pos)
  }

  commonPrefixLength (other) {
    const intersectingBits = Math.min(this.bitLength, other.bitLength)

    // First, advance by a full byte while it is possible
    let pos
    for (pos = 0;
      pos < intersectingBits >> 3 && this.key[pos >> 3] === other.key[pos >> 3];
      pos += 8) ;

    // Then, check individual bits
    for (; pos < intersectingBits && this.bit(pos) === other.bit(pos); pos++) ;

    return pos
  }

  /**
   * Computes a common prefix of this and another byte sequence.
   *
   * @param {ProofPath} other
   * @returns {ProofPath}
   */
  commonPrefix (other) {
    const pos = this.commonPrefixLength(other)
    return this.truncate(pos)
  }

  /**
   * Checks if the path starts with the other specified path.
   *
   * @param {ProofPath} other
   * @returns {boolean}
   */
  startsWith (other) {
    return this.commonPrefixLength(other) === other.bitLength
  }

  /**
   * Compares this proof path to another.
   *
   * @param {ProofPath} other
   * @returns {-1 | 0 | 1}
   */
  compare (other) {
    const [thisLen, otherLen] = [this.bitLength, other.bitLength]
    const intersectingBits = Math.min(thisLen, otherLen)
    const pos = this.commonPrefixLength(other)

    if (pos === intersectingBits) {
      return Math.sign(thisLen - otherLen)
    }
    return this.bit(pos) - other.bit(pos)
  }

  /**
   * Truncates this bit sequence to a shorter one by removing some bits from the end.
   *
   * @param {number} bits
   *   new length of the sequence
   * @returns {ProofPath}
   *   truncated bit sequence
   */
  truncate (bits) {
    bits = +bits
    if (bits > this.bitLength) {
      throw new TypeError('Cannot truncate bit slice to length more than current ' +
        `(current: ${this.bitLength}, requested: ${bits})`)
    }

    const bytes = new Uint8Array(BIT_LENGTH / 8)
    for (let i = 0; i < bits >> 3; i++) {
      bytes[i] = this.key[i]
    }
    for (let bit = 8 * (bits >> 3); bit < bits; bit++) {
      setBit(bytes, bit, this.bit(bit))
    }

    return new ProofPath(bytes, bits)
  }

  /**
   * Serializes this path into a buffer. The serialization is performed according as follows:
   *
   * 1. Serialize number of bits in the path in LEB128 encoding.
   * 2. Serialize bits with zero padding to the right.
   *
   * @param {Array<number>} buffer
   */
  serialize (buffer) {
    if (this.bitLength < 128) {
      buffer.push(this.bitLength)
    } else {
      // The length is encoded as two bytes.
      // The first byte contains the lower 7 bits of the length, and has the highest bit set
      // as per LEB128. The second byte contains the upper bit of the length
      // (i.e., 1 or 2), thus, it always equals 1 or 2.
      buffer.push(128 + (this.bitLength % 128), this.bitLength >> 7)
    }

    // Copy the bits.
    for (let pos = 0; pos < (this.bitLength + 7) >> 3; pos++) {
      buffer.push(this.key[pos])
    }
  }

  /**
   * Converts this path to its JSON presentation.
   *
   * @returns {string}
   *   binary string representing the path
   */
  toJSON () {
    const bits = hexadecimalToBinaryString(this.hexKey)
    return trimZeros(bits, this.bitLength)
  }

  toString () {
    let bits = hexadecimalToBinaryString(this.hexKey)
    bits = (this.bitLength > 8)
      ? trimZeros(bits, 8) + '...'
      : trimZeros(bits, this.bitLength)
    return `path(${bits})`
  }
}

/**
 * Expected length of byte buffers used to create `ProofPath`s.
 */
ProofPath.BYTE_LENGTH = BIT_LENGTH / 8

function getBit (buffer, pos) {
  const byte = Math.floor(pos / 8)
  const bitPos = pos % 8

  return (buffer[byte] & (1 << bitPos)) >> bitPos
}

/**
 * Sets a specified bit in the byte buffer.
 *
 * @param {Uint8Array} buffer
 * @param {number} pos 0-based position in the buffer to set
 * @param {0 | 1} bit
 */
function setBit (buffer, pos, bit) {
  const byte = Math.floor(pos / 8)
  const bitPos = pos % 8

  if (bit === 0) {
    const mask = 255 - (1 << bitPos)
    buffer[byte] &= mask
  } else {
    const mask = (1 << bitPos)
    buffer[byte] |= mask
  }
}

const ZEROS = (() => {
  let str = '0'
  for (let i = 0; i < 8; i++) str = str + str
  return str
})()

function padWithZeros (str, desiredLength) {
  return str + ZEROS.substring(0, desiredLength - str.length)
}

function trimZeros (str, desiredLength) {
  /* istanbul ignore next: should never be triggered */
  if (str.length < desiredLength) {
    throw new Error('Invariant broken: negative zero trimming requested')
  }
  return str.substring(0, desiredLength)
}
