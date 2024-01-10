// Import the Bolt package
import { App, ExpressReceiver, BlockAction, ViewOutput, ViewSubmitAction, SlashCommand } from '@slack/bolt';
// Import the Web API package
import { WebClient } from '@slack/web-api';
// Import the axios package
import axios from 'axios';

// Create a custom receiver
const receiver = new ExpressReceiver({ signingSecret: process.env.SLACK_SIGNING_SECRET });

// Create a Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

// Create a Web API client
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// Define the IDs of the Slack admins
const admins = ['U12345678', 'U87654321'];

// Define a helper function to get the Jenkins headers
const getJenkinsHeaders = () => {
  // Encode the Jenkins credentials
  const credentials = Buffer.from(`${process.env.JENKINS_USER}:${process.env.JENKINS_TOKEN}`).toString('base64');
  // Return the headers object
  return {
    headers: {
      Authorization: `Basic ${credentials}`
    }
  };
};

// Define a helper function to get the Jenkins job details
const getJenkinsJobDetails = async (jobName: string) => {
  // Make a GET request to the Jenkins API
  const response = await axios.get(`${process.env.JENKINS_URL}/job/${jobName}/api/json`, getJenkinsHeaders());
  // Return the job details
  return response.data;
};

// Define a helper function to get the Jenkins build details
const getJenkinsBuildDetails = async (jobName: string, buildNumber: number) => {
  // Make a GET request to the Jenkins API
  const response = await axios.get(`${process.env.JENKINS_URL}/job/${jobName}/${buildNumber}/api/json`, getJenkinsHeaders());
  // Return the build details
  return response.data;
};

// Define a helper function to get the Jenkins console log
const getJenkinsConsoleLog = async (jobName: string, buildNumber: number) => {
  // Make a GET request to the Jenkins API
  const response = await axios.get(`${process.env.JENKINS_URL}/job/${jobName}/${buildNumber}/consoleText`, getJenkinsHeaders());
  // Return the console log
  return response.data;
};

// Define a helper function to get the Jenkins username
const getJenkinsUsername = async () => {
  // Make a GET request to the Jenkins API
  const response = await axios.get(`${process.env.JENKINS_URL}/me/api/json`, getJenkinsHeaders());
  // Return the username
  return response.data.user.fullName;
};

// Define a helper function to format the build result
const formatBuildResult = (result: string) => {
  // Return a formatted string with emoji
  switch (result) {
    case 'SUCCESS':
      return ':white_check_mark: Success';
    case 'FAILURE':
      return ':x: Failure';
    case 'ABORTED':
      return ':stop_sign: Aborted';
    case 'UNSTABLE':
      return ':warning: Unstable';
    default:
      return ':question: Unknown';
  }
};

// Define a helper function to format the build duration
const formatBuildDuration = (duration: number) => {
  // Convert the duration from milliseconds to seconds
  const seconds = Math.floor(duration / 1000);
  // Return a formatted string
  return `${seconds} seconds`;
};

// Define a helper function to format the build timestamp
const formatBuildTimestamp = (timestamp: number) => {
  // Convert the timestamp from milliseconds to a date object
  const date = new Date(timestamp);
  // Return a formatted string
  return date.toLocaleString();
};

// Define a helper function to send a message to the user
const sendMessage = async (channel: string, text: string, user: string, ephemeral: boolean) => {
  // Check if the message should be ephemeral
  if (ephemeral) {
    // Send an ephemeral message to the user
    await web.chat.postEphemeral({
      channel,
      text,
      user
    });
  } else {
    // Send a regular message to the channel
    await web.chat.postMessage({
      channel,
      text
    });
  }
};

// Define a helper function to send a modal to the user
const sendModal = async (triggerId: string, title: string, blocks: any[], callbackId: string) => {
  // Send a modal view to the user
  await web.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: title
      },
      blocks,
      submit: {
        type: 'plain_text',
        text: 'Submit'
      },
      close: {
        type: 'plain_text',
        text: 'Cancel'
      },
      callback_id: callbackId
    }
  });
};

// Define a slash command handler for /jenkins-info
app.command('/jenkins-info', async ({ command, ack, respond }) => {
  // Acknowledge the command request
  await ack();

  try {
    // Get the Jenkins username
    const username = await getJenkinsUsername();
    // Get the Jenkins job details
    const jobDetails = await getJenkinsJobDetails(command.text);
    // Get the last build details
    const lastBuildDetails = await getJenkinsBuildDetails(command.text, jobDetails.lastBuild.number);
    // Format the message text
    const text = `*Jenkins Info for ${command.text}*\n
- Jenkins Username: ${username}\n
- Job Name: ${jobDetails.displayName}\n
- Job Description: ${jobDetails.description}\n
- Job URL: ${jobDetails.url}\n
- Last Build Number: ${lastBuildDetails.number}\n
- Last Build Result: ${formatBuildResult(lastBuildDetails.result)}\n
- Last Build Duration: ${formatBuildDuration(lastBuildDetails.duration)}\n
- Last Build Timestamp: ${formatBuildTimestamp(lastBuildDetails.timestamp)}`;
    // Send the message to the user
    await sendMessage(command.channel_id, text, command.user_id, false);
  } catch (error) {
    // Handle the error
    console.error(error);
    // Send an error message to the user
    await sendMessage(command.channel_id, `Sorry, something went wrong: ${error.message}`, command.user_id, false);
  }
});

// Define a slash command handler for /jenkins-log
app.command('/jenkins-log', async ({ command, ack, respond }) => {
  // Acknowledge the command request
  await ack();

  try {
    // Define the modal blocks
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Please enter the build number for the job you want to see the console log.'
        }
      },
      {
        type: 'input',
        block_id: 'build_number',
        label: {
          type: 'plain_text',
          text: 'Build Number'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'build_number',
          placeholder: {
            type: 'plain_text',
            text: 'Enter a number'
          }
        }
      }
    ];
    // Send the modal to the user
    await sendModal(command.trigger_id, `Jenkins Log for ${command.text}`, blocks, 'jenkins_log');
  } catch (error) {
    // Handle the error
    console.error(error);
    // Send an error message to the user
    await sendMessage(command.channel_id, `Sorry, something went wrong: ${error.message}`, command.user_id, false);
  }
});

// Define a view submission handler for jenkins_log
app.view('jenkins_log', async ({ ack, body, view, respond }) =>
