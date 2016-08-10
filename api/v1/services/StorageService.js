/* jshint esversion: 6 */

var config = require('../../config');
var files = require('../../files');
var logger = require('../../logging');
var errors = require('../errors');
var storageUtils = require('../utils/storage');
var Upload = require('../models/Upload');

var bytes = require('bytes');
var uuid = require('node-uuid');
var _Promise = require('bluebird');
var _ = require('lodash');

var client = require('aws-sdk');
client.config.credentials = new client.SharedIniFileCredentials({ profile: config.profile });
client.isEnabled = !!client.config.credentials.accessKeyId;

var remote = new client.S3();

const INVALID_LENGTH_MESSAGE = "The upload was larger than the maximum allowed length";
const INVALID_CONTENT_TYPE = "The upload did not match any of the allowed types";

const UPLOAD_KEY_SEPARATOR = '/';
const SIGNATURE_EXPIRATION = 10; // seconds

const CLIENT_NAME = "AWS_S3";

function _handleDisabledUpload (upload, file) {
	if (!config.isDevelopment) {
		// something went wrong and we made it into production without
		// an enabled client, so do not expose the instance's file system
		throw new errors.ApiError();
	}

	// TODO persist using files.writeFile
}

function _handleUpload (upload, file) {
	var params = {};
	params.Body = file.content;
	params.Bucket = upload.get('bucket');
	params.Key = upload.get('key');
	params.ContentDisposition = "attachment; filename=" + file.name;
	params.ContentLength = file.content.length;
	params.ContentType = file.type;

	return remote.putObject(params).promise()
		.catch(function (error) {
			var message = "the storage client received an error";
			message += " (" + error.message + ")";

			throw new errors.ExternalProviderError(message, CLIENT_NAME);
		});
}

/**
 * Finds an upload by its internal ID
 * @param  {Number} id			the internal ID of the requested upload
 * @return {Promise<Upload>}	the requested upload
 * @throws {NotFoundError}	when the upload does not exist
 */
module.exports.findUploadById = function (id) {
	return Upload
		.findById(id)
		.then(function (result) {
			if (_.isNull(result)) {
				var message = "An upload with the given ID cannot be found";
				var source = 'id';
				throw new errors.NotFoundError(message, source);
			}

			return _Promise.resolve(result);
		});
};

/**
 * Finds an upload by its key in a given bucket
 * @param  {String} key		the previously key given to the upload
 * @param  {String} bucket	the bucket assigned to the upload
 * @return {Promise<Upload>} the requested upload
 * @throws {NotFoundError} when the upload does not exist
 */
module.exports.findUploadByKey = function (key, bucket) {
	return Upload
		.findByKey(key, bucket)
		.then(function (result) {
			if (_.isNull(result)) {
				var message = "An upload with the given key does not exist in the provided bucket";
				var source = ['key', 'bucket'];
				throw new errors.NotFoundError(message);
			}

			return _Promise.resolve(result);
		});
};

/**
 * Creates an internal upload representation
 *
 * @param  {User} owner				the owner of the upload
 * @param  {Object} params			parameter object with
 *                           		{String} bucket			the target upload bucket
 *                           		{String} key			(optional) the 36-character key to use for the upload
 * @return {Promise<Upload>}		a promise resolving to the new upload
 *
 */
module.exports.createUpload = function (owner, params) {
	var uploadParams = {};
	uploadParams.ownerId = owner.get('id');
	uploadParams.key = params.key || uuid.v4();
	uploadParams.bucket = params.bucket;

	return Upload.forge(uploadParams).save();
};

/**
 * Provides a signed, short-term upload URI
 * @param  {Upload} upload			the internal upload representation associated with this upload
 * @param  {Object} file			parameter object with
 *                         			{String} content	the Buffer containing the file
 *                         			{String} type		the MIME type of the upload
 *                              	{String} name		the name of the upload
 * @param  {Object} params			(optional) specifies validation should be performed with any of the following
 *                           		{Array} allowedTypes	(optional) a list of allowed MIME types
 *                           		{Number} maxLength		(optional) the max length of the upload in bytes
 * @return {Promise<String>} an upload to which the file will be accepted
 * @throws {InvalidUploadError}	when the upload fails any imposed validations
 * @throws {ExternalProviderError}	when the upload fails any imposed validations
 */
module.exports.persistUpload = function (upload, file, params) {
	return new _Promise(function (resolve, reject) {
		if (params) {
			return module.exports.verifyUpload(file, params);
		}
		return resolve(true);
	})
	.then (function () {
		if (!client.isEnabled) {
			return _handleDisabledUpload(upload, file);
		}
		return _handleUpload(upload, file);
	});
};

/**
 * Provides a signed URL for retrieving a an upload
 * @param  {Upload} upload			an internal upload representation
 * @return {Promise<String>}
 * @throws {ExternalProviderError}	when the client throws an error
 */
module.exports.getUpload = function (upload) {
	return new _Promise(function (resolve, reject) {
		// TODO add aws support and remove wrapping promise
		return files.getFile(upload.get('key'));
	});
};

/**
 * Removes a file from storage
 *
 * @param {Upload} upload 			an internal upload representation
 * @param {Transaction} transaction	(optional) a pending database transaction
 * @return {Promise<>}				an empty promise indicating success
 * @throws {ExternalProviderError}	when the client throws an error
 */
module.exports.removeUpload = function (upload, transaction) {
	return files
		.removeStream(upload.get('key'))
		.then(function () {
			if (transaction) {
				return upload.destroy({ transacting: transaction });
			}
			return upload.destroy();
		});
};

/**
 * Removes all requested files from storage
 *
 * @param  {Array<Upload>} uploads 	the uploads to delete
 * @return {Promise<>}				an empty promise indicating success
 * @throws {ExternalProviderError}	when the client throws an error
 */
module.exports.removeAllUploads = function (uploads) {
	return Upload.transaction(function (t) {
		var removed = [];
		uploads.forEach(function (upload) {
			removed.push(module.exports.remove(upload, t));
		});

		return _Promise.all(removed);
	});
};
