/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSEP
 */

/**
 * Cryptography is an object responsible for various cryptographic functions.
 *
 * The API provides the following six features:
 * 1. Generates a securely random number
 * 2. Generates a securely random string
 * 3. Calculates a cryptographic hash
 * 4. Generates a securely random cryptographic salt
 * 5. Encrypts plaintext into ciphertext
 * 6. Decrypts ciphertext into plaintext
 *
 * Important Note:
 * According to MDN, crypto (window.crypto) is available on all Windows. However, in insecure contexts (such as when the
 * page is being served using the http protocol instead of https), crypto only has one usable method: getRandomValues().
 *
 * In general, we should only use this API in secure contexts.
 *
 * How to use it
 * -------------
 *
 * 1. Random Numbers:
 * Generate a random number between a minimum and maximum value by supplying the two arguments to the function
 *
 * const number1 = Cryptography.randomNumber();
 * const number2 = Cryptography.randomNumber(1, 100);
 *
 * 2. Random Strings:
 * Generate a random string of any length and alphabet by supplying the two arguments to the function
 *
 * const string1 = Cryptography.randomString();
 * const string2 = Cryptography.randomString(16, "abc123!");
 *
 * 3/4. Hashing/Salting:
 * You can use this to store hashes of sensitive data (e.g. passwords) and then run the hash function against the
 * plaintext password when it's entered again to see if it matches the hash you're storing
 * Note that you should also store the salt you used to generate the hash in your schema
 *
 * const salt = Cryptography.salt();
 * const hash = await Cryptography.hash("plaintext", salt);
 *
 * 5/6. Encrypting/Decrypting:
 * Generate a secret key however you prefer (for quick demonstration purposes,this uses Cryptography.salt())
 *
 * const key = Cryptography.salt();
 * const encryption = await Cryptography.encrypt("plaintext", key);
 * const decryption = await Cryptography.decrypt(encryption.ciphertext, encryption.iv, key);
 * @see https://developer.mozilla.org/en-US/docs/Web/API/crypto_property
 */
const Cryptography = (() => {

  /**
   * Generates a securely random number in the range of min (inclusive) and max (inclusive or exclusive).
   * For example, randomNumber(0,10) will return a number between 0-10, whereas randomNumber(0,10,false) returns 0-9.
   *
   * @param min       the minimum number in the range (inclusive)
   * @param max       the maximum number in the range (inclusive or exclusive)
   * @param inclusive true if the maximum number is inclusive, false if exclusive
   * @returns {number} the random number
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#getting_a_random_integer_between_two_values
   * @see https://stackoverflow.com/a/62792582
   * @public
   */
  function randomNumber(min = 0, max = 16, inclusive = true) {
    min = Math.ceil(min);
    max = Math.floor(max);
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1);
    return Math.floor(random * (max - min + (inclusive ? 1 : 0)) + min);
  }

  /**
   * Generates a securely random string.
   *
   * @param length   the length the string should be
   * @param alphabet the alphabet containing the valid characters in the string
   * @returns {string} the random string
   * @public
   */
  function randomString(length = 16, alphabet = "abcdefghijklmnopqrstuvwxyz") {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += alphabet.charAt(randomNumber(0, alphabet.length, false));
    }
    return result;
  }

  /**
   * Calculates a cryptographic hash. We use the PBKDF2 algorithm with an Hmac-SHA512 hash function.
   * For simplicity, we hardcode the algorithm, hash, and iterations. Note: 512 Bits = 64 Bytes = 88 B64 Characters. (Note: Firefox hangs if the text is empty.)
   *
   * @param text the text to hash
   * @param salt the salt to hash with
   * @returns {Promise<string>} the hash as a base 64 encoded string
   * @public
   */
  async function hash(text, salt) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(text), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-512", salt: b642u8a(salt), iterations: 1000 }, key, 512);
    return u8a2b64(new Uint8Array(bits));
  }

  /**
   * Generates a random cryptographic salt.
   *
   * @param length the length of the generated string
   * @returns {string} the salt as a base 64 encoded string
   * @public
   */
  function salt(length = 64) {
    return u8a2b64(crypto.getRandomValues(new Uint8Array(length)));
  }

  /**
   * Encrypts plaintext into ciphertext using a symmetric key. We use the AES-GCM algorithm with a SHA256 hash function.
   * For simplicity, we hardcode the algorithm. Note: 256 Bits = 32 Bytes = 44 B64 Characters.
   *
   * @param plaintext the text to encrypt
   * @param secret    the secret key
   * @returns {Promise<{iv: string, ciphertext: string}>} the iv and ciphertext as base 64 encoded strings
   * @public
   */
  async function encrypt(plaintext, secret) {
    const algorithm = { name: "AES-GCM", iv: crypto.getRandomValues(new Uint8Array(64)) };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await crypto.subtle.importKey("raw", digest, algorithm, false, ["encrypt"]);
    const encryption = await crypto.subtle.encrypt(algorithm, key, new TextEncoder().encode(plaintext));
    return { iv: u8a2b64(algorithm.iv), ciphertext: u8a2b64(new Uint8Array(encryption)) };
  }

  /**
   * Decrypts ciphertext into plaintext using a symmetric key. We use the AES-GCM algorithm with a SHA256 hash function.
   * For simplicity, we hardcode the algorithm. Note: 256 Bits = 32 Bytes = 44 B64 Characters.
   *
   * @param ciphertext the text to decrypt
   * @param iv         the initialization vector for the algorithm
   * @param secret     the secret key
   * @returns {Promise<string>} the decrypted text
   * @public
   */
  async function decrypt(ciphertext, iv, secret) {
    const algorithm = { name: "AES-GCM", iv: b642u8a(iv) };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await crypto.subtle.importKey("raw", digest, algorithm, false, ["decrypt"]);
    const decryption = await crypto.subtle.decrypt(algorithm, key, b642u8a(ciphertext));
    return new TextDecoder().decode(decryption);
  }

  /**
   * Converts an 8-bit Unsigned Integer Array to a Base 64 Encoded String.
   *
   * @param u8a the unsigned 8-bit integer array
   * @returns {string} the base 64 encoded string
   * @private
   */
  function u8a2b64(u8a) {
    return btoa(String.fromCharCode(...u8a));
  }

  /**
   * Converts a Base 64 Encoded String to an 8-bit Unsigned Integer Array.
   *
   * @param b64 the base 64 encoded string
   * @returns {Uint8Array} the unsigned 8-bit integer array
   * @private
   */
  function b642u8a(b64) {
    return new Uint8Array([...atob(b64)].map(c => c.charCodeAt(0)));
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    randomNumber,
    randomString,
    hash,
    salt,
    encrypt,
    decrypt
  };

})();