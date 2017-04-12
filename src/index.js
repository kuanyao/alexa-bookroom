'use strict';
var Alexa = require("alexa-sdk");
var AWS = require('aws-sdk');
var sqs = new AWS.SQS();

var requestQueueUrl = "https://sqs.us-east-1.amazonaws.com/456270554954/reserveRoomReq";
var responseQueueUrl = "https://sqs.us-east-1.amazonaws.com/456270554954/meetingResponseQueue";
var room = "IAD21/07/101";

var STATES = {
    LAUNCH: 'LAUNCH',
    WAITING_RESPONSE: 'WAITING_RESPONSE'
};

function makeId() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var i = 0;

    for (i=0; i < 8; i++ ) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}

var requestId = makeId();

exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.registerHandlers(handlers);
    alexa.execute();
};

var handlers = {
    "ReserveRoomIntent": function () {
        console.log("Invoke reserve room intent ");
        var duration = getItem(this.event.request.intent.slots, "duration");
        console.log("... with duration: " + duration);
        var request = sendRequest(duration, room);
        console.log(request);

        var that = this;
        var meetingResponseReseived;

        sendRequest(duration, room)
            .then(function(data) {
                console.log("successfull send sqs request.");
                return checkForResponse();
            })
            .then(function(data){
                console.log("check for response returned.");

                data.Messages.forEach( msg => {
                    var meetingResponse = JSON.parse(msg.Body);
                    console.log(meetingResponse);
                    if (meetingResponse.requestId == requestId || meetingResponse.requestId == "testingId") {
                        meetingResponseReseived = meetingResponse;
                    }
                });
                var params = {
                    QueueUrl: responseQueueUrl, 
                    Entries: data.Messages.map(m => { return { Id: m.MessageId, ReceiptHandle: m.ReceiptHandle }; })
                };
                console.log("deleting messages from queue.");
                console.log(params);
                return sqs.deleteMessageBatch(params).promise();
            })
            .then(function(data){
                console.log("message has been deleted from response queue.");
                console.log(data);
                if (meetingResponseReseived.isRequestSatisfied) {
                    that.emit(":tell", "I have reserved this room for you");
                } else if (meetingResponseReseived) {
                    that.emit(":tell", "Sorry this room has been reserved already");
                } else {
                    that.eimi(":tell", "Sorry I am unable to book you for any room at this time.");
                }
            })
            .catch(function(error){
                console.log("error");
                console.log(error);
                that.emit(':tell', 'there is an error');
            });
    },
    "Unhandled": function() {
        this.emit(':tell', "Unknown command.");
    }
};

function getItem(slots, name) {
    for (var slot in slots) {
        if (slots[slot].name === name) {
            return slots[slot].value;
        }
    }
    return null;
}

function checkForResponse() {
 var params = {
        AttributeNames: [
            "All"
        ], 
        MaxNumberOfMessages: 10, 
        MessageAttributeNames: [
            "All"
        ], 
        QueueUrl: responseQueueUrl, 
        VisibilityTimeout: 20, 
        WaitTimeSeconds: 20
    };

    return sqs.receiveMessage(params).promise();
}

function sendRequest(duration, room) {
    var params = {
            MessageAttributes: {
                "room": {
                    "DataType": "String",
                    "StringValue": room
                },
                "duration": {
                    "DataType": "String",
                    "StringValue": duration
                },
                "startAt": {
                    "DataType": "String",
                    "StringValue": "now"
                },
                "responseQueueUrl": {
                    "DataType": "String",
                    "StringValue": responseQueueUrl
                },
                "requestId": {
                    "DataType": "String",
                    "StringValue": requestId
                }
            }, 
            MessageBody: "ReserveForRoom",
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/456270554954/reserveRoomReq"
        };
    console.log(params);
    return sqs.sendMessage(params).promise();
}
