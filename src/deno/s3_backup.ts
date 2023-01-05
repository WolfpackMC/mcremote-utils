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
    const p = Deno.run({
        cmd: [
            // use zip instead of 7z
            "zip",
            "-r",
            `/tmp/backup/${options.name}-${t}.zip`,
            `${options.data}`,
        ],
        stdout: "piped",
        stderr: "piped",
    })

    console.log("Running zip to create a backup...")

    // Wait for the process to finish
    Deno.stdout.write(await p.output())

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
