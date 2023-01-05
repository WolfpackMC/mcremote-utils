
## unix timestamp
timestamp=$(date +%s)

zip -r $1-$timestamp.zip $2

aws s3 cp $1-$timestamp.zip s3://$3
