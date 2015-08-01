// set azure storage setting

var Promise = require("promise");

var AZURE_AUTH_FILE = '../ssl/azure_keys.json';
var BLOB_HOST = 'https://richreview.blob.core.windows.net/';
var ACCOUNT = 'richreview';
var nconf = require('nconf');
nconf.env().file({ file: AZURE_AUTH_FILE });
var sql_key_tedious = nconf.get("sql_key_tedious");
var blob_storage_key = nconf.get("blob_storage_key");
if( typeof sql_key_tedious == 'undefined' ||  typeof blob_storage_key == 'undefined' ){
    throw new Error(AZURE_AUTH_FILE + " not found")
}

var storage = require('azure-storage');
var blob_svc = storage.createBlobService(ACCOUNT, blob_storage_key, BLOB_HOST).withFilter(new storage.ExponentialRetryPolicyFilter());
var fs = require('fs');
var request = require('request');

var ConnectionTD = require('tedious').Connection;
var RequestTD = require('tedious').Request;
var config = sql_key_tedious;

exports.BlobFileDownload = function(c, b, f, cb){
    var wr = fs.createWriteStream(f);
    wr.on('finish', function(error){
        if(error){error_result = error;}
        wr.close(cb);
    });
    wr.on('error', function(error){
        error_result = error;
        wr.close(cb);
    });

    var rd = request.get(BLOB_HOST + c + '/' + b, function (error) {
        if(error){
            error_result = error;
            wr.close(cb);
        }
    });
    rd.on('error', function(error){
            if(error){error_result = error;}
        });
    rd.pipe(wr);
};

exports.svc = blob_svc;
exports.BLOB_HOST = BLOB_HOST;
exports.sqlQuery = function(cmd, callback){
    var sqlconn = new ConnectionTD(config);
    sqlconn.on('connect', function(error) {
            if(error){
                console.log('Error from sqlconn.on');
                console.log(error);
                callback(error);
            }
            else{
                var result = [];
                sqlreq = new RequestTD(cmd, function(err, rowCount) {
                    if (error) {
                        console.log('Error from RequestTD');
                        console.log(error);
                        callback(error);
                    } else {
                        callback(error, result);
                    }
                    sqlconn.close();
                });

                sqlreq.on('row', function(columns) {
                    var r = {};
                    for(var i = 0; i < columns.length; ++i){
                        r[columns[i].metadata.colName] = columns[i].value;
                    }
                    result.push(r);
                });

                sqlconn.execSql(sqlreq);
            }
        }
    );
};

exports.CreateContainerIfNotExist = function(ctx){
    return new Promise(function(resolve, reject){
        blob_svc.createContainerIfNotExists(
            ctx.container,
            { publicAccessLevel : 'blob' },
            function(err, result){
                if(err){
                    reject(err);
                }
                else{
                    resolve(ctx)
                }
            }
        );
    });
};

exports.DoesBlobExist = function(ctx){
    return new Promise(function(resolve, reject){
        blob_svc.doesBlobExist(ctx.container, ctx.blob, function(err, resp){
            if(err){
                reject(err)
            }
            else{
                ctx.is_blob_exist = resp;
                resolve(ctx);
            }
        });
    });
};

exports.CreateBlobFromLocalFile = function(ctx){
    return new Promise(function(resolve, reject){
        if(ctx.is_blob_exist){
            resolve(ctx);
        }
        else{
            blob_svc.createBlockBlobFromLocalFile(ctx.container, ctx.blob, ctx.blob_localfile_path,
                function(err){
                    if(err){
                        reject(err);
                    }
                    else{
                        resolve(ctx);
                    }
                }
            );
        }
    });
};