const cron = require('node-cron')
const fse = require("fs-extra")

//LiteLoaderScript Dev Helper
/// <reference path="d:\Dev\git\llse/dts/llaids/src/index.d.ts"/> 

ll.registerPlugin(
    /* name */ "",
    /* introduction */ "",
    /* version */[0, 0, 1],
    /* otherInformation */ {}
);

logger.setTitle("EasyStats")
const DIR = "./plugins/EasyStats"
const DATA_FILE = "Data.json"
const DAILY_LOG_FILE = "DayLog.json"
const WEEKLY_LOG_FILE = "WeekLog.json"
const MONTHLY_LOG_FILE = "MonthLog.json"
const PLAYER_DATA_FILE = "PlayerData.json"
const ACU_TMP_DATA_FILE = "ACU_Tmp_Data.json"

let CCU = 0
let PCU = 0
let RU = 0


function init() {
    try {
        fse.ensureDirSync(DIR)
        logger.info("初始化配置目录成功")
        initFile(DATA_FILE, { RU: 0, PCU: 0 })
        initFile(DAILY_LOG_FILE, [])
        initFile(WEEKLY_LOG_FILE, [])
        initFile(MONTHLY_LOG_FILE, [])
        initFile(PLAYER_DATA_FILE, [])
        initFile(ACU_TMP_DATA_FILE, [])
    } catch (err) {
        logger.debug(err);
        logger.warn('初始化配置失败');
    }
    let data = load(DATA_FILE)
    PCU = data.PCU
}

function initFile(file, data) {
    let path = `${DIR}/${file}`
    try {
        let exists = fse.pathExistsSync(path);
        if (!exists) {
            fse.writeJSONSync(path, data)
            logger.info(`初始化${file}成功`);
        } else {
            logger.info(`检测到${file}`);
        }
    } catch (err) {
        logger.debug(err);
        logger.warn(`${file} 初始化失败`);
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

let dTask = cron.schedule('0 0 5 * *', doDayTask, {
    scheduled: false,
    timezone: "Asia/Shanghai"
});

let wTask = cron.schedule('15 0 5 * * 1', doWeekTask, {
    scheduled: false,
    timezone: "Asia/Shanghai"
});

let mTask = cron.schedule('30 0 5 1 *', doMonthTask, {
    scheduled: false,
    timezone: "Asia/Shanghai"
});

let cuTask = cron.schedule('0 */5 * * *', doCUTask, {
    scheduled: false,
    timezone: "Asia/Shanghai"
});

class Player {
    constructor(xuid) {
        this.xuid = xuid
        this.playtime = 0
        this.DOT = 0
        this.WOT = 0
        this.MOT = 0
        this.last_login_at = new Date().getTime()
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
    logger.info('定时任务已启动')
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
        logger.info(`当前在线玩家数量:${CCU}`)
    } else {
        logger.warn(`更新${ACU_TMP_DATA_FILE}失败`)
    }
}

function getDate() {
    let now = new Date().getTime()
    let ydt = now - 1000 * 60 * 60 * 24
    let lwt = now - 1000 * 60 * 60 * 24 * 7
    let YD = new Date(ydt)

    let DAY = YD.getDay()
    let DATE = YD.getDate()
    let LOCALE_DATE = YD.toLocaleDateString()
    let lmt = now - 1000 * 60 * 60 * 24 * DATE
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
    for (let index = 0; index < tmpCUData.length; index++) {
        allCU = allCU + tmpCUData[index].CCU
    }
    ACU = (allCU / DAU).toFixed(2)
    DAOT = (allDOT / DAU).toFixed(2)
    insertData(DAILY_LOG_FILE, {
        CREATED_AT: new Date().getTime(),
        LOCALE_DATE, DAU, DNU, ACU, DAOT, NEW_USER
    })
    saveData(ACU_TMP_DATA_FILE, [])
    saveData(PLAYER_DATA_FILE, playerData)
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
    let WAU = 0, WNU = 0, ACU = 0, allCU = 0, WDAOT = 0
    let NEW_USER = []
    for (let index = 0; index < playerData.length; index++) {
        let { xuid, WOT, last_login_at, created_at } = playerData[index]
        if (created_at > lwt) {
            WNU += 1
            NEW_USER.push(xuid)
        }
        if ((last_login_at > lwt) || WOT > 0) {
            WAU += 1
            allDOT = allDOT + WOT
        }
        playerData[index].WOT = 0
    }
    for (let index = 0; index < dayLogData.length; index++) {
        let { CREATED_AT, ACU, DAOT } = dayLogData[index]
        if (CREATED_AT > lwt) {
            allCU = allCU + ACU
            WDAOT = WDAOT + DAOT
        }
    }
    ACU = (allCU / 7).toFixed(2)
    WDAOT = (WDAOT / 7).toFixed(2)
    insertData(WEEKLY_LOG_FILE, {
        CREATED_AT: new Date().getTime(),
        LOCALE_DATE, WAU, WNU, ACU, WDAOT, NEW_USER
    })
    saveData(PLAYER_DATA_FILE, playerData)
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
    let MAU = 0, MNU = 0, ACU = 0, allCU = 0, MDAOT = 0
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
        if (CREATED_AT > lwt) {
            allCU = allCU + ACU
            MDAOT = MDAOT + DAOT
        }
    }
    ACU = (allCU / DATE).toFixed(2)
    MDAOT = (MDAOT / DATE).toFixed(2)
    insertData(WEEKLY_LOG_FILE, {
        CREATED_AT: new Date().getTime(),
        LOCALE_DATE, MAU, MNU, ACU, MDAOT, NEW_USER
    })
    saveData(PLAYER_DATA_FILE, playerData)
    dTask.start()
}


function onJoin(pl) {
    CCU += 1
    if (CCU > PCU) {
        saveData(DATA_FILE, { RU, PCU })
    }
    let [index, data] = findIndexByXuid(pl.xuid)
    if (data === null) {
        //加载失败
        logger.warn('用户数据加载失败');
        //pl.kick("用户数据加载失败，请联系管理员处理");
        return false;
    }
    if (index === null) {
        //玩家数据不存在，增加玩家数据
        let pdata = new Player(pl.xuid)
        insertData(PLAYER_DATA_FILE, pdata)
        RU += 1
        logger.info(`新增玩家数据(${pl.xuid})成功,已注册用户数量:${RU},当前在线人数:${CCU}`)
    } else {
        data.last_login_at = new Date().getTime()
        data.updated_at = new Date().getTime()
        updateData(PLAYER_DATA_FILE, data)
        logger.info(`玩家数据(${pl.xuid})更新成功,已注册用户数量:${RU},当前在线人数:${CCU}`)
    }
}

function onLeft(pl) {
    CCU -= 1
    let [index, data] = findIndexByXuid(pl.xuid)
    if (data === null) {
        //加载失败
        logger.warn('用户数据加载失败');
        //pl.kick("用户数据加载失败，请联系管理员处理");
        return false;
    }
    if (index === null) {
        logger.warn(`玩家数据(${pl.xuid})不存在,退服数据更新失败,已注册用户数量:${RU},当前在线人数:${CCU}`)
    } else {
        addPlayTime(data)

        logger.info(`玩家数据(${pl.xuid})更新成功,已注册用户数量:${RU},当前在线人数:${CCU}`)
    }
}

function addPlayTime(data) {
    let { last_login_at } = data
    let now = new Date().getTime()
    addTime = now - last_login_at
    data.playtime += addTime
    data.DOT += addTime
    data.WOT += addTime
    data.MOT += addTime
    data.last_logout_at = now
    data.updated_at = now
    updateData(PLAYER_DATA_FILE, data)
}

init()
startTask()

mc.listen("onJoin", onJoin)
mc.listen("onLeft", onLeft)


