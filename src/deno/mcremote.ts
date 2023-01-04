import "https://deno.land/x/dotenv@v3.2.0/load.ts"

import * as log from "https://deno.land/std@0.170.0/log/mod.ts"

import { encode, decode } from "https://deno.land/std@0.170.0/encoding/base64.ts"

import { PrismaClient } from "../generated/client/deno/edge.ts"

import { Input, Secret } from "https://deno.land/x/cliffy@v0.25.6/prompt/mod.ts"
import { Command } from "https://deno.land/x/cliffy@v0.25.6/command/mod.ts"

const { options } = await new Command()
    .option("-s, --salt=[salt]", "A custom salt.")
    .option("-g, --generate", "Generate a new password only.")
    .parse(Deno.args)

const pepper = () => Deno.env.get("PEPPER") as string

if (!pepper() || pepper() === "" || pepper() === "undefined") {
    log.error("PEPPER is not set")
    Deno.exit(1)
} else {
    log.info("PEPPER is set")
}

const crypt = async (pepper: string, salt: Uint8Array, password: string) => {
    return await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pepper + salt + password))
}

const genSalt = () => {
    const salt = new Uint8Array(16)
    crypto.getRandomValues(salt)
    return salt
}

const genHash = async (password: string, salt: Uint8Array) => {
    const hash = await crypt(pepper(), salt, password)
    return hash
}

const verifyPassword = async (password: string, encodedSalt: string, encodedHash: string) => {
    const salt = decode(encodedSalt)
    const hash = decode(encodedHash)

    const newHash = await crypt(pepper(), salt, password)

    return new Uint8Array(newHash).every((v, i) => v === hash[i])
}

const genApiKey = async () => {
    const key = new Uint8Array(32)
    crypto.getRandomValues(key)
    const salt = genSalt()
    const hash = await genHash(encode(key), salt)
    return {
        encrypted: `${encode(salt)}$${encode(hash)}`,
        key: encode(key),
    }
}

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: Deno.env.get("MCREMOTE_PRISMA_URL"),
        },
    },
})

const promptPassword: () => Promise<string> = async () => {
    const password: string = await Secret.prompt("Enter a password")

    if (!password) {
        log.warning("Password is required")
    }

    const password2: string = await Secret.prompt("Confirm password")

    if (password !== password2) {
        log.warning("Passwords do not match")
        return promptPassword()
    }

    return password
}

const promptUsername: () => Promise<string> = async () => {
    const name: string = await Input.prompt("Enter a username")

    if (!name) {
        log.warning("Username is required")
        return promptUsername()
    }

    const out = await prisma.account.count({
        where: {
            name,
        },
    })

    console.log(out)

    if (out) {
        log.warning("Username already exists")
        return promptUsername()
    }
    return name
}

const main = async () => {
    const username = options.generate ? "" : await promptUsername()
    const password = await promptPassword()

    const salt = typeof options.salt === "string" ? decode(options.salt) : genSalt()

    const hash = await genHash(password, salt)

    const encodedSalt = encode(salt)
    const encodedHash = encode(new Uint8Array(hash))

    if (await verifyPassword(password, encodedSalt, encodedHash)) {
        log.info("Password verified")
    } else {
        log.error("Password verification failed")
        Deno.exit(1)
    }


    const account = await prisma.account.create({
        data: {
            name: username,
            password: `${encodedSalt}$${encodedHash}`,
        },
    })

    const apiKey = await genApiKey()

    await prisma.apiKey.create({
        data: {
            key: apiKey.encrypted,
            account: {
                connect: {
                    id: account.id,
                },
            },
        },
    })

    if (account) {
        log.info("Account created")
        log.info("Save this somewhere, you will not be able to see it again.")
        log.info(`Username: ${account.name}`)
        log.info(`API Key: ${apiKey.key}`)
    } else {
        log.error("Account creation failed")
        Deno.exit(1)
    }
}

main()