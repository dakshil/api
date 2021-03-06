const Request = require('./Request');
const Event = require('../models/Event');
const validators = require('../utils/validators');

const eventLocationValidations = {
  locationId: ['required', 'integer']
};

const bodyRequired = [ 'event' ];
const bodyAllowed = [ 'eventLocations' ];
const event = new Event();
const bodyValidations = {
  'event': ['required', 'plainObject'],
  'event.name': ['required', 'string', 'maxLength:255'],
  'event.description': ['required', 'string', 'maxLength:2047'],
  'event.startTime': ['required', validators.date],
  'event.endTime': ['required', validators.date],
  'event.tag': event.validations.tag,
  'eventLocations': ['array', validators.array(validators.nested(eventLocationValidations, 'eventLocations'))]
};

function EventCreationRequest(headers, body) {
  Request.call(this, headers, body);

  this.bodyRequired = bodyRequired;
  this.bodyAllowed = bodyAllowed;
  this.bodyValidations = bodyValidations;
}

EventCreationRequest._eventLocationValidations = eventLocationValidations;

EventCreationRequest.prototype = Object.create(Request.prototype);
EventCreationRequest.prototype.constructor = EventCreationRequest;

module.exports = EventCreationRequest;
