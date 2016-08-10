var checkit = require('checkit');
var _ = require('lodash');

var errors = require('../errors');

var headersValidations = { };
var bodyValidations = { };
var headersRequired = [];
var bodyRequired = [];
var bodyAllowed = [];

// base request class
function Request(headers, body) {
	this.headersValidations = headersValidations;
	this.bodyValidations = bodyValidations;
	this.headersRequired = headersRequired;
	this.bodyRequired = bodyRequired;
	this.bodyAllowed = bodyAllowed;

	this._headers = headers;
	this._body = body;
	this._audited = false;
	this._marshalled = false;
}

Request.prototype.constructor = Request;

/**
 * Provides read-only access to this request's body
 * @return {Object} a request body which may or may not be validated
 */
Request.prototype.body = function () {
	return this._body;
};

/**
 * Ensures that all required parameters are present in the request and sets
 * the audited flag
 * @throws UnprocessableRequestError when the request cannot be parsed
 * @throws MissingParameterError when the request is missing a parameter
 * @throws MissingHeaderError when the request is missing a header
 */
Request.prototype.audit = function () {
	var missingHeaders = [];
	var missingParameters = [];

	_.forEach(this.headersRequired, _.bind(function (requiredHeader) {
		if (!_.has(this._headers, requiredHeader.toLowerCase())) {
			missingHeaders.push(requiredHeader);
		}
	}, this));

	if (missingHeaders.length) {
		throw new errors.MissingHeaderError(null, missingHeaders);
	}

	if (!this._body) {
		var errorDetail = 'The request body could not be parsed';
		throw new errors.UnprocessableRequestError(errorDetail, null);
	}

	if (!(this._body instanceof Buffer) && !(this._body instanceof String)) {
		// we can only run validations on certain types of request bodies from
		// the body parser ('raw' and 'text' will not work here)

		_.forEach(this.bodyRequired, _.bind(function(requiredParameter) {
			if (!_.has(this._body, requiredParameter))
				missingParameters.push(requiredParameter);
		}, this));

		if (missingParameters.length) {
			throw new errors.MissingParameterError(null, missingParameters);
		}
	}

	this._audited = true;
};

/**
 * Removes any request parameters in the body that are not either required or
 * allowed and set the marshalled flag
 */
Request.prototype.marshal = function () {
	this._body = _.pick(this._body, _.merge(this.bodyRequired, this.bodyAllowed));
	this._marshalled = true;
};

/**
 * Validates the request body by auditing, marshalling it, and finally
 * running request-specific validations
 * @return {Promise} resolving to the result of running Checkit's validations
 */
Request.prototype.validate = function () {
	if (!this._audited)
		this.audit();
	if (!this.marshalled)
		this.marshal();

	return checkit(this.headersValidations).run(this._headers)
		.then(function () {
			return checkit(this.bodyValidations).run(this._body);
		});
};

module.exports = Request;
