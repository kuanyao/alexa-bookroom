'use strict';
var Alexa = require("alexa-sdk");
var AWS = require('aws-sdk');
var sqs = new AWS.SQS();

var requestQueueUrl = "https://sqs.us-east-1.amazonaws.com/456270554954/reserveRoomReq";
var responseQueueUrl = "https://sqs.us-east-1.amazonaws.com/456270554954/meetingResponseQueue";
var room = "IAD21-01.404";

var states = {
    FINDROOM: '_FIND_ROOM',
    BOOKROOM: '_BOOK_ROOM'
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
    alexa.registerHandlers(handlers, findRoomHandlers, bookRoomHandlers);
    alexa.execute();
};

var findRoomHandlers = Alexa.CreateStateHandler(states.FINDROOM, {
    "NewSession": function() {
        this.emit(":ask", "Sorry this room has been reserved already, would you like me to search for another room for you?", "Would you like me to find another room for you?");
    },
    "AMAZON.YesIntent": function() {
        var duration = this.attributes["duration"].toString();
        var that = this;

        bookRoomRequest(duration, room, "findroom", this,
            (response) => {
                var roomSuggestion = response.roomSuggestion;
                that.attributes["room"] = roomSuggestion;
                that.handler.state = states.BOOKROOM;
                that.emitWithState('NewSession');
            },
            (response) => {
                that.handler.state = states.FINDROOM;
                that.attributes["duration"] = duration;
                that.emitWithState('NewSession');
            });
    },
    "AMAZON.NoIntent": function() {
        this.emit(":tell", "no problem");
    },
    "Unhandled": function() {
        this.emit(":ask", "would you like me to find another room?", "say yes or no"); 
    }
});

var bookRoomHandlers = Alexa.CreateStateHandler(states.BOOKROOM, {
    "NewSession": function() {
        var roomSuggestion = this.attributes["room"].toString();
        this.emit(":ask", `I have found room ${roomSuggestion} is available, would you like to take it?`, `Say yes to take room ${roomSuggestion} or no to cancel booking`);
    },    
    "AMAZON.YesIntent": function() {
        room = this.attributes["room"].toString();
        this.handler.state = "";
        this.emitWithState("ReserveRoomIntent");
    },
    "AMAZON.NoIntent": function() {
        this.emit(":tell", "no problem.");
    },
    "Unhandled": function() {
        this.ask(":ask", "would you like to take this room?", "say yes or no");
    }
});

var handlers = {
    "ReserveRoomIntent": function () {
        console.log("Invoke reserve room intent ");
        var duration = getItem(this.event.request.intent.slots, "duration");
        if (!duration) {
            duration = this.attributes["duration"].toString();
        }
        console.log("... with duration: " + duration);

        var that = this;

        bookRoomRequest(duration, room, "bookroom", this,
            (response) => {
                that.emit(":tell", "I have reserved this room for you");
            },
            (response) => {
                that.handler.state = states.FINDROOM;
                that.attributes["duration"] = duration;
                that.emitWithState('NewSession');
            });
    },
    "WhoHasThisRoomIntent": function() {
        this.emit(":tell", "Kuan has this room, he always has this room.");
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

function bookRoomRequest(duration, room, command, alexa, successCallback, failCallback) {
    var meetingResponseReseived = {};
    var params = {
            MessageBody: `{ "requestId": "${requestId}", "command": "${command}", "duration": "${duration}", "roomId": "${room}", "requestBy": "kuanyao", "responseQueueUrl": "${responseQueueUrl}" }`,
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/456270554954/reserveRoomReq"
        };
    console.log(params);

    sqs.sendMessage(params).promise()
        .then(function(data) {
            console.log("successfull send sqs request.");
            return checkForResponse();
        })
        .then(function(data){
            console.log("check for response returned.");

            if (!data.Messages) {
                console.log("timeout reached. no response from sqs.");
                return;
            }

            console.log("Total messages received: " + data.Messages.length);

            data.Messages.forEach( msg => {
                var meetingResponse = JSON.parse(msg.Body);
                console.log(meetingResponse);
                if ((meetingResponse.requestId == requestId || meetingResponse.requestId == "testingId")
                    && meetingResponse.command == command) {
                    meetingResponseReseived = meetingResponse;
                    console.log("match metting response found in queue.");
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
            if (!!data) {
                console.log("message has been deleted from response queue.");
                console.log(data);
            }
            if (meetingResponseReseived.isRequestSatisfied === true) {
                successCallback(meetingResponseReseived);
            } else if (meetingResponseReseived.isRequestSatisfied === false) {
                failCallback(meetingResponseReseived);
            } else {
                alexa.emit(":tell", "Sorry I am unable to book you for any room at this time.");
            }
        })
        .catch(function(error){
            console.log("error");
            console.log(error);
            that.emit(':tell', 'there is an error');
        });

}
