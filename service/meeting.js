'use strict';

var AWS = require('aws-sdk');
AWS.config.update({region:'us-east-1'});

var sqs = new AWS.SQS();

var requestQueueUrl = "https://sqs.us-east-1.amazonaws.com/456270554954/reserveRoomReq";
var responseQueueUrl = "https://sqs.us-east-1.amazonaws.com/456270554954/meetingResponseQueue";

const spawn = require('child_process').spawn;
const util = require('util');
const EventEmitter = require('events');

var states = {
    WAITING_SQS_INPUT: '_waiting_sqs_input',
    DELETING_SQS_MESSAGE: '_deleting_sqs_message',
    REQUEST_FOR_ROOM_ONLY: '_request_for_meeting_room_only',
    RETRY_TO_RESERVE: '_try_to_reserve'
};

function MeetingService() {
  EventEmitter.call(this);
}
util.inherits(MeetingService, EventEmitter);

var ms = new MeetingService();
ms.on('listensqs', function() {
    console.log('listen sqs ...');
    var params = {
        AttributeNames: [
            "All"
        ], 
        MaxNumberOfMessages: 1, 
        MessageAttributeNames: [
            "All"
        ], 
        QueueUrl: requestQueueUrl, 
        VisibilityTimeout: 20, 
        WaitTimeSeconds: 20
    };

    var messageReceived = null;
    var that = this;

    sqs.receiveMessage(params)
        .promise()
        .then(function(data){
            if (data.Messages && data.Messages.length == 0) {
                console.log("no message received.");
                return;
            } else if (data.Messages && data.Messages.length > 0) {
                messageReceived = JSON.parse(data.Messages[0].Body);
                console.log("Message received: ");
                console.log(messageReceived);
                var params = {
                    QueueUrl: requestQueueUrl, 
                    Entries: data.Messages.map(m => { return { Id: m.MessageId, ReceiptHandle: m.ReceiptHandle }; })
                };
                console.log("deleting messages from queue.");
                console.log(params);
                return sqs.deleteMessageBatch(params).promise();
            }
        })
        .then(function(data){
            if (data) {
                console.log("deleting message result: ");
                console.log(data);
            }
            if (messageReceived) {
                if (messageReceived.command == "bookroom") {
                    if (messageReceived.roomId == "IAD21-01.404") {
                        return sendResponse(messageReceived.requestId, messageReceived.command, false, "", messageReceived.responseQueueUrl);
                    } else {
                        return sendResponse(messageReceived.requestId, messageReceived.command, true, "", messageReceived.responseQueueUrl);
                    }
                } else if (messageReceived.command == "findroom") {
                    return sendResponse(messageReceived.requestId, messageReceived.command, true, "IAD21-01.403", messageReceived.responseQueueUrl);
                }
            }
        })
        .then(function(){
            that.emit('listensqs');
        })
        .catch(function(error){
            console.log(error);
        });
});

function sendResponse(requestId, command, result, roomSuggestion, responseQueueUrl) {
    var params = {
        MessageBody: `{ "requestId": "${requestId}", "command": "${command}", "isRequestSatisfied": ${result}, "roomSuggestion": "${roomSuggestion}" }`,
        QueueUrl: responseQueueUrl
    };
    console.log("sending response.");
    console.log(params);

    return sqs.sendMessage(params).promise();
}

ms.emit('listensqs');

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


rl.question('Enter anything to stop program:', (answer) => {

});
