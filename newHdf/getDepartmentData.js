/**
 * Created by haojing on 15/11/9.
 */
var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var iconv = require('iconv-lite');
//var db = require('./mdb');
var _ = require('lodash');
var path = require('path');
var moment = require('moment');
var fs = require('fs');

var expired =moment().subtract(7, 'days').format('YYYY-MM-DD');
console.log(expired);


var infos = [];

request({
    encoding:null,
    url:'http://zixun.haodf.com/dispatched/all.htm'
}, function (error, response, body) {
    if(! error && response.statusCode == 200) {
        //console.log(iconv.decode(body,"GBK").toString());
        console.log('第一步');
        crawClass(iconv.decode(body,"GBK").toString())
    }
});


//爬取科室
function crawClass(html) {
    var $ = cheerio.load(html);

    var department = $('.izixun-department ul li span a');
    var departments = [];
    department.each(function (item) {
        var departmentUrl = $(this).attr('href');
        var departmentName = $(this).text();
        //db.createHaodf(departmentName);
        departments.push({departmentName: departmentName, departmentUrl: departmentUrl});

    });

    async.mapSeries(departments, function (department, callb) {
        var eachInfo = {departmentName: department.departmentName,departmentUrl: [], questionsNumber: 0};
        infos.push(eachInfo);
        departmentsClass( department.departmentUrl, function (err, res) {
            callb(null, '');
        })
    }, function (err, result) {
        console.log('跑完了@@@@')
        getCount();
    })
}

//遍历科室获取每个科室的每一页的url的URL

function departmentsClass (departmentUrl, cb) {
    var urls = _.range(1, 35).map(function (i) {
        return departmentUrl + '?p=' + i;
    })

    async.mapSeries(urls, function(item, callback) {
        console.log(item);
        setTimeout(function () {
            request({
                encoding:null,
                url:item
            }, function (error, response, body) {
                if(! error && response.statusCode == 200) {
                    handleWeb(iconv.decode(body,"GBK").toString(), function (err, data) {
                        callback(null, '');
                    });
                }
            });
        }, 2000);
    }, function(err,results) {
        cb(null, '');
    });

}

function handleWeb(html, cb) {

    $ = cheerio.load(html);
    var txtList = $('li.clearfix');
    var p_dept = $('a.red').text();//科室名称
    var p_id = path.basename($('a.red').attr('href'), '.htm');
    var g_dept = $('a.red').parents('ul').find('li').first().text();
    var grp = g_dept + " " + p_dept;
    var num = 0;
    var tLink = [];
    txtList.each(function (item) {
        var txt = $(this);
        var t_link = txt.find('span.fl a').last().attr('href');
        tLink.push(t_link);
    });

    var index = _.findIndex(infos, function(chr) {
        return chr.departmentName == p_dept;
    });

    var array = infos[index].departmentUrl;
    infos[index].departmentUrl =  _.union(tLink, array);
    cb(null,'');
}


function getCount () {
    async.mapSeries(infos, function (item, fb) {
        var departmentName = item.departmentName;
        console.log(item.departmentUrl.length);
        async.mapLimit(item.departmentUrl, 2, function (eachUrl, callback) {
            setTimeout(function () {
                request({
                    encoding:null,
                    url: eachUrl
                }, function (error, response, body) {
                    if(! error && response.statusCode == 200) {
                        $ = cheerio.load(iconv.decode(body,"GBK").toString());
                        var publishTime =$('div.yh_l_times').text().substring(0, 10);//提问日期
                        if(publishTime>expired) {
                            //数据库数据修改
                            console.log('提交时间', publishTime, eachUrl);

                            var index = _.findIndex(infos, function(chr) {
                                return chr.departmentName == p_dept;
                            });

                            var number =  infos[index].questionsNumber ;
                            infos[index].questionsNumber = number +1;
                            cb(null, '');
                        } else {
                            console.log('提交时间在7天之前', publishTime, eachUrl);
                            callback(null,'');
                        }
                    }
                });
            }, 3000)
        }, function (err, results) {
            console.log('完成');
            fb(null, '');
        })
    }, function (err, result) {
        var array = _.chain(infos)
            .sortBy('questionsNumber')
            .reverse()
            .value();
        array.map(function (item) {
            fs.appendFile('./haodf.txt',
                item.departmentName+': '+item.questionsNumber+'\n', function (err) {
                    //console.log('The "data to append" was appended to file! ',result); //数据被添加到文件的尾部
                });
        })
    })

}