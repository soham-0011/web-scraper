const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const ses = new SESClient({ region: "ap-south-1" });

async function sendEmailNotification(subject, body) {
  const params = {
    Destination: { ToAddresses: ["soham.wagh@i3digitalhealth.com"] },
    Message: {
      Body: { Text: { Data: body } },
      Subject: { Data: subject },
    },
    Source: "soham.wagh@i3digitalhealth.com",
  };

  try {
    const result = await ses.send(new SendEmailCommand(params));
    console.log("Email sent:", result.MessageId);
  } catch (err) {
    console.error("SES send error:", err.message);
  }
}
module.exports = sendEmailNotification;
