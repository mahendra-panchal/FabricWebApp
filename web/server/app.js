/*
Copyright LedgerDomain LLC 2017 All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

         http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const express = require('express');
const path = require('path');
const SimpleClient = require('./SimpleClient.js');
const winston = require('winston');
const util = require('util');

const app = express();

function assert (condition, message) {
    if (!condition) {
        logger.error('!!! assert FAILED !!! message: ' + message);
        logger.error('!!! stack trace:');
        const err = new Error(message);
        logger.error(err.stack);
        throw err;
    }
}

function sleep (milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function sleep__p (delay_milliseconds) {
    for (let i = 0; i < 10; i++) {
        logger.info('---------------------------------------------------------------------------');
    }
    logger.info('-- BEGIN sleeping for %d ms', delay_milliseconds);
    return sleep(delay_milliseconds)
    .then(() => {
        logger.info('-- DONE sleeping for %d ms', delay_milliseconds);
        for (let i = 0; i < 10; i++) {
            logger.info('---------------------------------------------------------------------------');
        }
    });
}

const logger = new(winston.Logger)({
    level: 'debug',
    transports: [
        new(winston.transports.Console)({
            colorize: true
        }),
    ]
});

// ./netcfg.json is the read-only configuration for peer network
// ./appcfg.json is the read-only configuration for application
const simple_client = new SimpleClient(require('./netcfg.json'), require('./appcfg.json'), Boolean(JSON.parse(process.env.TLS_ENABLED)));

// TODO: Move this to util.js
function arrays_are_equal_as_sets (lhs_array, rhs_array) {
    if (lhs_array.length != rhs_array.length) {
        return false;
    }

    // We don't want to modify the existing arrays.
    // https://davidwalsh.name/javascript-clone-array
    var lhs_array_clone = lhs_array.slice(0);
    var rhs_array_clone = rhs_array.slice(0);

    lhs_array_clone.sort();
    rhs_array_clone.sort();
    for (i = 0; i < lhs_array_clone.length; i += 1) {
        if (lhs_array_clone[i] != rhs_array_clone[i]) {
            return false;
        }
    }
    return true;
}

function check_request_query_for_keys (req_query, expected_keys) {
    var req_query_keys = Object.keys(req_query);
    if (arrays_are_equal_as_sets(req_query_keys, expected_keys)) {
        return null;
    } else {
        return 'expected ' + expected_keys.length + ' keys ' + JSON.stringify(expected_keys) + ' but got ' + req_query_keys.length + ' keys ' + JSON.stringify(req_query_keys);
    }
}

app.use('/', express.static(path.join(__dirname, '../client')));

const temp_hardcoded_channel_name = 'mychannel';

function invoke (invoking_user_org_name, fcn, req_query_arg_names, req, res) {
    var key_error = check_request_query_for_keys(req.query, ['invoking_user_name'].concat(req_query_arg_names));
    if (key_error !== null) {
        res.write(key_error);
        res.end();
        return;
    }

    // TODO: throw error if the req.query lookups fail
    const invoking_user_name = req.query['invoking_user_name'];

    const args = [];
    for (const req_query_arg_name of req_query_arg_names) {
        // TODO: throw error if the req.query lookups fail
        args.push(req.query[req_query_arg_name]);
    }

    console.log('invoke - req_query_arg_names = %j', req_query_arg_names);
    console.log('invoke - args = %j', args);

    const description = util.format('INVOKE; invoking_user_name: "%s", invoking_user_org_name: "%s", fcn: "%s", args: %j', invoking_user_name, invoking_user_org_name, fcn, args);

    return simple_client.invoke__p({
        channel_name: temp_hardcoded_channel_name,
        invoking_user_name: invoking_user_name,
        invoking_user_org_name: invoking_user_org_name,
        fcn: fcn,
        args: args
    })
    .then(result => {
        console.log('%s COMPLETE; typeof(result) = "%s", result:', description, typeof(result), result);
        res.write(JSON.stringify(result));
        res.end();
    })
    .catch(err => {
        console.log('%s ERROR:', description, err);
        const response = JSON.stringify({'message':err.message});
        console.log('ERROR response: "%s"', response);
        res.status(500); // this code is "internal server error", which is fine for now.
        res.write(response);
        res.end();
    });
}

function query (invoking_user_org_name, fcn, req_query_arg_names, req, res, complete_handler) {
    var key_error = check_request_query_for_keys(req.query, ['invoking_user_name'].concat(req_query_arg_names));
    if (key_error !== null) {
        res.write(key_error);
        res.end();
        return;
    }

    // TODO: throw error if the req.query lookups fail
    const invoking_user_name = req.query['invoking_user_name'];

    const args = [];
    for (const req_query_arg_name of req_query_arg_names) {
        // TODO: throw error if the req.query lookups fail
        args.push(req.query[req_query_arg_name]);
    }

    console.log('query - req_query_arg_names = %j', req_query_arg_names);
    console.log('query - args = %j', args);

    const description = util.format('QUERY; invoking_user_name: "%s", invoking_user_org_name: "%s", fcn: "%s", args: %j', invoking_user_name, invoking_user_org_name, fcn, args);

    return simple_client.query__p({
        channel_name: temp_hardcoded_channel_name,
        invoking_user_name: invoking_user_name,
        invoking_user_org_name: invoking_user_org_name,
        fcn: fcn,
        args: args
    })
    .then(query_result => {
        console.log('%s COMPLETE; query_result:', description, query_result.toString());
        if (complete_handler) {
            complete_handler(query_result);
        } else {
            res.write(query_result);
            res.end();
        }
    })
    .catch(err => {
        console.log('%s ERROR:', description, err);
        const response = JSON.stringify({'message':err.message});
        console.log('ERROR response: "%s"', response);
        res.status(500); // this code is "internal server error", which is fine for now.
        res.write(response);
        res.end();
    });
}

// This defines a service endpoint on the server to which HTTP POST requests will be made,
// ( e.g. localhost:3000/create_account?invoking_user_name=Admin&account_name=Bob&initial_balance=123 ).
app.post('/create_account', function(req, res){
    // TODO: Check if the account already exists (via enrollment)

    // TODO: throw error if the req.query lookups fail
    const account_name = req.query['account_name'];
    // NOTE: org1.department1 is a dummy -- affiliations haven't been configured correctly yet, still using defaults from CA.
    simple_client.register_and_enroll_user_in_org__p(account_name, undefined, 'user', 'org1.department1', 'org0', 'admin')
    .then(user => {
        // invoking_user_name is a required argument implicitly; this will be replaced if/when user sessions
        // are added to the web client/server.
        invoke('org0', 'create_account', ['account_name', 'initial_balance'], req, res);
    })
    .catch(err => {
        // For some reason, err is empty if the user is already registered, so just make up an error message.
        const response = JSON.stringify({'message':'Error registering or enrolling "'+account_name+'"'});
        console.log('ERROR response: "%s"', response);
        res.status(500); // this code is "internal server error", which is fine for now.
        res.write(response);
        res.end();
    });
});

// NOTE: delete_account is temporarily disabled until a well-defined schema for revoking enrollment
// and updating the relevant user context, etc.
// app.post('/delete_account', function(req, res){
//     // TODO: Check if the account already exists (via enrollment)
//
//     // TODO: throw error if the req.query lookups fail
//     const account_name = req.query['account_name'];
//     simple_client.revoke_enrollment_for_user_in_org__p(account_name, 'org0', 'deletion of account', 'admin')
//     .then(result => {
//         // invoking_user_name is a required argument implicitly; this will be replaced if/when user sessions
//         // are added to the web client/server.
//         invoke('org0', 'delete_account', ['account_name'], req, res);
//     })
//     .catch(err => {
//         const response = JSON.stringify({'message':err});
//         console.log('ERROR response: "%s"', response);
//         res.status(500); // this code is "internal server error", which is fine for now.
//         res.write(response);
//         res.end();
//     });
// });

app.post('/transfer', function(req, res){
    // invoking_user_name is a required argument implicitly; this will be replaced if/when user sessions
    // are added to the web client/server.
    invoke('org0', 'transfer', ['from_account_name', 'to_account_name', 'amount'], req, res);
});

app.get('/query_balance', function(req, res){
    // invoking_user_name is a required argument implicitly; this will be replaced if/when user sessions
    // are added to the web client/server.
    query('org0', 'query_balance', ['account_name'], req, res);
});

app.get('/query_account_names', function(req, res){
    // invoking_user_name is a required argument implicitly; this will be replaced if/when user sessions
    // are added to the web client/server.
    query('org0', 'query_account_names', [], req, res);
});

const SERVER_PORT = process.env.SERVER_PORT === undefined ? 3000 : process.env.SERVER_PORT;

console.log('SERVER_PORT: ' + SERVER_PORT);

let server;

Promise.resolve()
.then(() => {
    return simple_client.create_kvs_for_each_org__p()
})
.then(() => {
    return simple_client.enroll_all_users_for_each_org__p()
})
.then(() => {
    return simple_client.create_channels__p()
})
.then(() => {
    // This wait appears to be necessary -- is there some event that must be listened for
    // in order to wait for channel creation to complete?  Why doesn't it do that already?
    return sleep__p(1000)
})
.then(() => {
    return simple_client.join_channels__p()
})
.then(() => {
    return simple_client.install_and_instantiate_chaincode_on_channel__p({
        channel_name: temp_hardcoded_channel_name,
        invoking_user_name_for_org: { // TEMP HACK -- probably use channel joiner user
            'org0': 'Admin',
            'org1': 'Admin'
        },
        fcn: 'init',
        args: []
    })
})
.then(() => {
    // This wait appears to be necessary -- is there some event that must be listened for
    // in order to wait for install/instantiate to complete?  Why doesn't it do that already?
    return sleep__p(5000)
})
.then(() => {
    return Promise.all([
        simple_client.enroll_user_in_org__p('admin', 'adminpw', 'org0'),
        simple_client.enroll_user_in_org__p('admin', 'adminpw', 'org1')
    ]);
})
.then(results => {
    server = app.listen(SERVER_PORT, function () {
        console.log('server listening at http://%s:%s', server.address().address, server.address().port);
    });
})
.catch(err => {
    logger.error('CAUGHT UNHANDLED ERROR: ', err);
    process.exit(1);
});

