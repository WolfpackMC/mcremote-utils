import "https://deno.land/x/dotenv@v3.2.0/load.ts"

import { S3Client, PutObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.241.0"

import { Command } from "https://deno.land/x/cliffy@v0.25.6/command/mod.ts"

const { options } = await new Command()
    .option("-n, --name [name]","The name of the backup file.", { required: true })
    .option("-d, --data [data]","The path to the data folder.", { required: true, default: "./data" })
    .parse(Deno.args)


const s3 = new S3Client({
    region: "us-east-1",
    credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") as string,
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") as string,
    },
})

const timestamp = () => new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "")

const main = async () => {

    const t = timestamp()

    // Run 7z to create a backup on the ./backup folder
    const p = Deno.run({
        cmd: [
            "7z",
            "a",
            "-t7z",
            "-mx=9",
            "-mfb=273",
            "-ms",
            "-md=31",
            "-myx=9",
            "-mtm=-",
            "-mmt",
            "-mmtf",
            "-md=1536m",
            "-mmf=bt3",
            "-mmc=10000",
            "-mpb=0",
            "-mlc=0",
            "-bb3",
            `/tmp/backup/${options.name}-${t}.7z`,
            `${options.data}`,
        ],
        stdout: "piped",
        stderr: "piped",
    })

    console.log("Running 7z to create a backup...")

    // Wait for the process to finish
    const { code } = await p.status()

    if (code !== 0) {
        const rawError = await p.stderrOutput()
        Deno.stderr.write(rawError)
        Deno.exit(code)
    }

    const putObjectCommand = new PutObjectCommand({
        Bucket: "wolfpackmc",
        Key: `backups/${options.name}-${t}.7z`,
        Body: Deno.readFileSync(`/tmp/backup/${options.name}-${t}.7z`),
    })

    await s3.send(putObjectCommand)

    // Delete the backup from the ./backup folder
    await Deno.remove(`/tmp/backup/${options.name}-${t}.7z`)

    console.log("Done.")

}

main()
