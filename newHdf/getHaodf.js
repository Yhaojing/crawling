/**
 * Created by haojing on 15/11/13.
 */
var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var iconv = require('iconv-lite');
var db = require('./mdb');
var _ = require('lodash');
var path = require('path');
var moment = require('moment');
var fs = require('fs');

var expired =moment().subtract(7, 'days').format('YYYY-MM-DD');
console.log(expired);

var dResult =[];
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
    async.mapSeries(department, function (item, callback) {
        var departmentUrl = $(item).attr('href');
        var departmentName = $(item).text();
        dResult.push({name: departmentName, number: 0});
        var urls = _.range(1, 35).map(function (i) {
            return departmentUrl + '?p=' + i;
        });
        var result = {name: departmentName, pageUrls:urls};
        callback(null, result);
    }, function(err, results) {
        console.log('科室34页遍历');
        async.mapLimit(results, 4, function (eachDepartment, fn) {
            //eachDepartment = {name: '', pageUrls[]}
            console.log('第一层');
            async.mapLimit(eachDepartment.pageUrls, 4, function (pageUrl, fn1) {
                request({
                    encoding:null,
                    url:pageUrl
                }, function (error, response, body) {
                    if(! error && response.statusCode == 200) {
                        $ = cheerio.load(iconv.decode(body,"GBK").toString());
                        var p_dept = $('a.red').text();//科室名称
                        var txtList = $('li.clearfix');
                        console.log('第2层');
                        async.mapLimit(txtList, 3, function (link, fn2) {
                            var txt = $(link);
                            var t_link = txt.find('span.fl a').last().attr('href');
                            request({
                                encoding:null,
                                url: t_link
                            }, function (error, response, body) {
                                if(! error && response.statusCode == 200) {
                                    $ = cheerio.load(iconv.decode(body,"GBK").toString());
                                    var publishTime =$('div.yh_l_times').text().substring(0, 10);//提问日期
                                    if(publishTime >= expired) {
                                        //数据库数据修改
                                        var index = _.findIndex(dResult, function(chr) {
                                            return chr.name == p_dept;
                                        });
                                        var count = dResult[index].number;
                                        dResult[index].number = count + 1;
                                        fn2(null,  dResult[index].number);
                                    } else {
                                        fn2(null,'');
                                    }
                                }
                            });
                        }, function (err, result3) {
                            fn1(null, '');
                        })
                    }
                });
            }, function (err, result2) {
                    fn(null, '');
            })
        }, function (err, result1){
            console.log('最后排序');
            var array = _.chain(dResult)
                .sortBy('questionsNumber')
                .reverse()
                .value();
            console.log('结果', array);
            array.map(function (res) {
                fs.appendFile('./haodf.txt',
                    res.name+': '+res.number+'\n', function (err) {
                    });
            })

        })

    })
}

