import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
const sns = new SNSClient({});
const TopicArn = process.env.ALERT_TOPIC_ARN;

export async function publishSns({ subject, message }) {
  return sns.send(new PublishCommand({
    TopicArn,
    Subject: subject?.slice(0, 100) ?? "Daily Stock Alert",
    Message: message ?? ""
  }));
}