const cron = require('node-cron')
const fse = require("fs-extra")

//LiteLoaderScript Dev Helper

ll.registerPlugin(
    /* name */ "",
    /* introduction */ "",
    /* version */[1, 0, 3],
    /* otherInformation */ {}
);

logger.setTitle("EasyStats")

const HOURTIME = 1000 * 60 * 60
const DAYTIME = 24 * HOURTIME
const WEEKTIME = 7 * DAYTIME

const DIR = "./plugins/EasyStats"
const DATA_FILE = "Data.json"
const DAILY_LOG_FILE = "DayLog.json"
const WEEKLY_LOG_FILE = "WeekLog.json"
const MONTHLY_LOG_FILE = "MonthLog.json"
const PLAYER_DATA_FILE = "PlayerData.json"
const ACU_TMP_DATA_FILE = "ACU_Tmp_Data.json"

const CRON_DAILY = "0 0 5 * * *"
const CRON_WEEKLY = "15 0 5 * * 1"
const CRON_MONTHLY = "30 0 5 1 * *"
const CRON_ACU = "30 */5 * * * *"
const CRON_CONFIG = {
    scheduled: false,
    timezone: "Asia/Shanghai"
}

let CCU = 0
let PCU = 0
let RU = 0
let playerList = new Map()

function init() {
    try {
        fse.ensureDirSync(DIR)
        logger.info("[INIT] 初始化配置目录成功")
        initFile(DATA_FILE, { RU: 0, PCU: 0 })
        initFile(DAILY_LOG_FILE, [])
        initFile(WEEKLY_LOG_FILE, [])
        initFile(MONTHLY_LOG_FILE, [])
        initFile(PLAYER_DATA_FILE, [])
        initFile(ACU_TMP_DATA_FILE, [])
    } catch (err) {
        logger.debug(err);
        logger.warn('[INIT] 初始化配置失败');
    }
    let data = load(DATA_FILE)
    let { RU: tmpRU, PCU: tmpPCU } = data
    RU = tmpRU
    PCU = tmpPCU
}

function initFile(file, data) {
    let path = `${DIR}/${file}`
    try {
        let exists = fse.pathExistsSync(path);
        if (!exists) {
            fse.writeJSONSync(path, data)
            logger.info(`[INIT] 初始化${file}成功`);
        } else {
            logger.info(`[INIT] 检测到${file}`);
        }
    } catch (err) {
        logger.debug(err);
        logger.warn(`[INIT] ${file} 初始化失败`);
    }
}

function load(file) {//加载数据
    let path = `${DIR}/${file}`
    try {
        return fse.readJSONSync(path);
    } catch (err) {
        logger.debug(err);
        logger.warn(`${file}读取失败`);
        return null;
    }
}


function insertData(file, data) {//添加数据
    let tmpdata = load(file);
    if (!tmpdata) return false;
    tmpdata.push(data);
    return saveData(file, tmpdata)
}

function updateData(file, index, data) {//更新数据
    let tmpdata = load(file);
    if (!tmpdata) return false;
    tmpdata[index] = data;
    return saveData(file, tmpdata)
}

function saveData(file, date) {
    try {
        fse.writeJSONSync(`${DIR}/${file}`, date);
        return true;
    } catch (err) {
        logger.debug(err);
        logger.warn(`${file}数据保存失败`);
        return false;
    }
}

function findIndexByXuid(xuid) {//玩家是否存在
    let playerData = load(PLAYER_DATA_FILE);
    if (playerData === null) return [null, null];

    let index = playerData.findIndex((item) => {
        let xuidExists = item.xuid === xuid;
        return xuidExists;
    })
    return index >= 0 ? [index, playerData[index]] : [null, playerData];
}

let dTask = cron.schedule(CRON_DAILY, doDayTask, CRON_CONFIG);
let wTask = cron.schedule(CRON_WEEKLY, doWeekTask, CRON_CONFIG);
let mTask = cron.schedule(CRON_MONTHLY, doMonthTask, CRON_CONFIG);
let cuTask = cron.schedule(CRON_ACU, doCUTask, CRON_CONFIG);

class Player {
    constructor(xuid, login_at) {
        this.xuid = xuid
        this.playtime = 0
        this.DOT = 0
        this.WOT = 0
        this.MOT = 0
        this.last_login_at = login_at
        this.last_logout_at = new Date().getTime()
        this.created_at = new Date().getTime()
        this.updated_at = new Date().getTime()
    }
}

function startTask() {
    cuTask.start()
    dTask.start()
    wTask.start()
    mTask.start()
    logger.info('[START] 定时任务已启动')
}

function stopTask() {
    cuTask.stop()
    dTask.stop()
    wTask.stop()
    mTask.stop()
}

function doCUTask() {
    //每五分钟执行一次
    let tmpData = {
        CCU,
        created_at: new Date().getTime()
    }
    let state = insertData(ACU_TMP_DATA_FILE, tmpData)
    if (state) {
        logger.info(`[HEART] 当前在线玩家(CCU):${CCU} 玩家总数(RU):${RU} 最高同时在线(PCU):${PCU} `)
    } else {
        logger.warn(`[HEART] 更新${ACU_TMP_DATA_FILE}失败`)
    }
}

function getDate() {
    let now = new Date().getTime()
    let ydt = now - DAYTIME
    let lwt = now - WEEKTIME
    let YD = new Date(ydt)

    let DAY = YD.getDay()
    let DATE = YD.getDate()
    let LOCALE_DATE = YD.toLocaleDateString()
    let lmt = now - DAYTIME * DATE
    return {
        now,
        ydt,
        lwt,
        lmt,
        DAY,
        DATE,
        LOCALE_DATE,
    }
}

function doDayTask() {
    //每天凌晨五点执行一次
    let { ydt, LOCALE_DATE } = getDate()
    cuTask.stop()
    let playerData = load(PLAYER_DATA_FILE)
    let tmpCUData = load(ACU_TMP_DATA_FILE)
    // if (!playerData || !tmpCUData) {
    //     updateData(ACU_TMP_DATA_FILE, [])
    //     cuTask.start()
    //     return logger.warn('获取玩家数据失败，日统计数据未更新')
    // }
    let DAU = 0, DNU = 0, ACU = 0, allCU = 0, DAOT = 0, allDOT = 0
    let NEW_USER = []
    for (let index = 0; index < playerData.length; index++) {
        let { xuid, DOT, last_login_at, created_at } = playerData[index]
        if (created_at > ydt) {
            DNU += 1
            NEW_USER.push(xuid)
        }
        if ((last_login_at > ydt) || DOT > 0) {
            DAU += 1
            allDOT = allDOT + DOT
        }
        playerData[index].DOT = 0
    }
    let len = tmpCUData.length
    for (let index = 0; index < len; index++) {
        let { CCU } = tmpCUData[index]
        allCU += CCU
    }
    ACU = len === 0 ? "0.00" : (allCU / len).toFixed(2)
    DAOT = DAU === 0 ? "0.00" : (allDOT / DAU).toFixed(2)
    //脑瘫了，我说怎么一直不对
    //     ACU = (allCU / DAU).toFixed(2)
    //     DAOT = (allDOT / DAU).toFixed(2)
    insertData(DAILY_LOG_FILE, {
        CREATED_AT: new Date().getTime(),
        LOCALE_DATE, DAU, DNU, ACU, DAOT, NEW_USER
    })
    saveData(ACU_TMP_DATA_FILE, [])
    saveData(PLAYER_DATA_FILE, playerData)
    logger.info(`[DAILY] <昨日数据统计> 活跃数(DAU):${DAU} 新增数(DNU):${DNU} 平均在线人数(ACU):${ACU} 平均在线时长(DAOT):${DAOT} `)
    //logger.info(`昨日新增玩家:${NEW_USER}`)
    cuTask.start()
}

function doWeekTask() {
    let { lwt, LOCALE_DATE } = getDate()
    lwt = lwt - 15 * 1000
    dTask.stop()
    let playerData = load(PLAYER_DATA_FILE)
    let dayLogData = load(DAILY_LOG_FILE)
    // if (!playerData||!dayLogData) {
    //     doDayTask.start()
    //     return logger.warn('获取玩家数据失败，日统计数据未更新')
    // }
    let WAU = 0, WNU = 0, ACU = 0, allCU = 0, WDAOT = 0, allDOT = 0
    let NEW_USER = []
    for (let index = 0; index < playerData.length; index++) {

        let { xuid, WOT, last_login_at, created_at } = playerData[index]
        if (created_at > lwt) {
            WNU += 1
            NEW_USER.push(xuid)
        }
        if ((last_login_at > lwt) || WOT > 0) {
            WAU += 1
            allDOT += WOT
        }
        playerData[index].WOT = 0

    }
    for (let index = 0; index < dayLogData.length; index++) {
        let { CREATED_AT, ACU, DAOT } = dayLogData[index]
        if (CREATED_AT > lwt) {
            allCU = ACU === "NaN" ? allCU : allCU + parseFloat(ACU)
            WDAOT = DAOT === "NaN" ? WDAOT : WDAOT + parseFloat(DAOT)
        }
    }
    ACU = (allCU / 7).toFixed(2)
    WDAOT = (WDAOT / 7).toFixed(2)
    insertData(WEEKLY_LOG_FILE, {
        CREATED_AT: new Date().getTime(),
        LOCALE_DATE, WAU, WNU, ACU, WDAOT, NEW_USER
    })
    saveData(PLAYER_DATA_FILE, playerData)
    logger.info(`[WEEKLY] <上周数据统计> 活跃数(WAU):${WAU} 新增数(WNU):${WNU} 平均在线人数(ACU):${ACU} 平均在线时长(WDAOT):${WDAOT} `)
    dTask.start()
}

function doMonthTask() {
    let { lmt, DATE, LOCALE_DATE } = getDate()
    lmt = lmt - 30 * 1000
    dTask.stop()
    let playerData = load(PLAYER_DATA_FILE)
    let dayLogData = load(DAILY_LOG_FILE)
    // if (!playerData||!dayLogData) {
    //     doDayTask.start()
    //     return logger.warn('获取玩家数据失败，日统计数据未更新')
    // }
    let MAU = 0, MNU = 0, ACU = 0, allCU = 0, MDAOT = 0, allDOT = 0
    let NEW_USER = []
    for (let index = 0; index < playerData.length; index++) {
        let { xuid, MOT, last_login_at, created_at } = playerData[index]
        if (created_at > lmt) {
            MNU += 1
            NEW_USER.push(xuid)
        }
        if ((last_login_at > lmt) || MOT > 0) {
            MAU += 1
            allDOT = allDOT + MOT
        }
        playerData[index].MOT = 0
    }
    for (let index = 0; index < dayLogData.length; index++) {
        let { CREATED_AT, ACU, DAOT } = dayLogData[index]
        if (CREATED_AT > lmt) {
            allCU = ACU === "NaN" ? allCU : allCU + parseFloat(ACU)
            MDAOT = DAOT === "NaN" ? MDAOT : MDAOT + parseFloat(DAOT)
        }
    }
    ACU = (allCU / DATE).toFixed(2)
    MDAOT = (MDAOT / DATE).toFixed(2)
    insertData(WEEKLY_LOG_FILE, {
        CREATED_AT: new Date().getTime(),
        LOCALE_DATE, MAU, MNU, ACU, MDAOT, NEW_USER
    })
    saveData(PLAYER_DATA_FILE, playerData)
    logger.info(`[MONTHLY] <上月数据统计> 活跃数(MAU):${MAU} 新增数(MNU):${MNU} 平均在线人数(ACU):${ACU} 平均在线时长(MDAOT):${MDAOT} `)
    dTask.start()

}


function onJoin(pl) {
    playerList.set(pl.xuid, new Date().getTime())
    CCU += 1
    if (CCU > PCU) {
        PCU = CCU
        saveData(DATA_FILE, { RU, PCU })
    }
    let [index, data] = findIndexByXuid(pl.xuid)
    if (data === null) {
        //加载失败
        logger.warn('[JOIN] 用户数据加载失败');
        //pl.kick("用户数据加载失败，请联系管理员处理");
        return false;
    }
    if (index === null) {
        //玩家数据不存在，增加玩家数据
        let login_at = playerList.get(pl.xuid)
        let pdata = new Player(pl.xuid, login_at)

        insertData(PLAYER_DATA_FILE, pdata)
        RU = RU + 1
        saveData(DATA_FILE, { RU, PCU })
        logger.info(`[JOIN] 玩家进服数据(${pl.xuid})添加成功 玩家总数(RU):${RU} 当前在线人数(CCU):${CCU} `)
    } else {
        data.last_login_at = new Date().getTime()
        data.updated_at = new Date().getTime()
        updateData(PLAYER_DATA_FILE, data)
        logger.info(`[JOIN] 玩家进服数据(${pl.xuid})更新成功 玩家总数(RU):${RU} 当前在线人数(CCU):${CCU} `)
    }
}

function onLeft(pl) {
    if (!playerList.has(pl.xuid)) {
        return
    }

    let login_at = playerList.get(pl.xuid)
    CCU -= 1
    playerList.delete(pl.xuid)
    let [index, data] = findIndexByXuid(pl.xuid)
    if (data === null) {
        //加载失败
        logger.warn('[LEFT] 用户数据加载失败');
        //pl.kick("用户数据加载失败，请联系管理员处理");
        return false;
    }
    if (index === null) {
        logger.warn(`[LEFT] 玩家数据(${pl.xuid})不存在,退服数据更新失败`)
    } else {
        let add = addPlayTime(index, data, login_at)
        if (add) {
            logger.info(`[LEFT] 玩家退服数据(${pl.xuid})更新成功 玩家总数(RU):${RU} 当前在线人数(CCU):${CCU} `)
        } else {
            logger.warn(`[LEFT] 玩家退服数据(${pl.xuid})更新失败 玩家总数(RU):${RU} 当前在线人数(CCU):${CCU} `)
        }

    }
}

function addPlayTime(index, data, login_at) {
    if (typeof login_at === undefined) return false
    let now = new Date().getTime()
    addTime = now - login_at
    data.playtime += addTime
    data.DOT += addTime
    data.WOT += addTime
    data.MOT += addTime
    data.last_logout_at = now
    data.updated_at = now
    return updateData(PLAYER_DATA_FILE, index, data)
}

function getPlayerInfo(xuid) {
    let [index, data] = findIndexByXuid(xuid)

    if(data === null){
        return null
    }else{
        if(xuid === "all") return data
        if(index === null) return null
        return data
    }
}

function compare(prop){
    return function(a,b){
        let value1 = a[prop]
        let value2 = b[prop]
        return value1-value2
    }
}

function getDayLog(limit = 7) {
    let dayLogData = load(DAILY_LOG_FILE);
    if (dayLogData === null) return null

    let rt = dayLogData.slice(-limit,)
    rt.sort(compare('CREATED_AT'))
    rt.reverse()
    return rt
}

function getWeekLog(limit = 1) {

    let weekLogData = load(WEEKLY_LOG_FILE);
    if (weekLogData === null) return null


    let rt = weekLogData.slice(-limit,)

    rt.sort(compare('CREATED_AT'))
    rt.reverse()
    return rt
}

function getMonthLog(limit = 1) {

    let monthLogData = load(MONTHLY_LOG_FILE);
    if (monthLogData === null) return null

    let rt = monthLogData.slice(-limit,)

    rt.sort(compare('CREATED_AT'))
    rt.reverse()
    return rt
}
function getStats() {
    return {
        RU, PCU, CCU,
        DayStats: getDayLog()[0],
        WeekStats: getWeekLog()[0],
        MonthStats: getMonthLog()[0]
    }
}

// function regCMD() {

// }


//导出函数
ll.export(getStats, "EasyStats", "getStats")
ll.export(getPlayerInfo, "EasyStats", "getPlayerInfo")
ll.export(getDayLog, "EasyStats", "getDayLog")
ll.export(getWeekLog, "EasyStats", "getWeekLog")
ll.export(getMonthLog, "EasyStats", "getMonthLog")



init()
startTask()
//setTimeout(doWeekTask, 15000)

//setTimeout(doMonthTask, 10000)

mc.listen("onJoin", onJoin)
mc.listen("onLeft", onLeft)


