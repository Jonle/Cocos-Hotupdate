const { ccclass, property } = cc._decorator;

const UpdateMsg = [
    'No use hot update!',
    'No local manifest file found, hot update skipped.',
    'Fail to download manifest file, hot update skipped.',
    'Fail to parse manifest file, hot update skipped.',
    'Asset update error.',
    'Compression package decoding failed.',
    'Already up to date with the latest remote version.',
    'New version found, please try to update.',
    'Update finished.',
    'Update failed.'
];

enum State {
    NONE,
    ERROR_NO_LOCAL_MANIFEST,
    ERROR_DOWNLOAD_MANIFEST,
    ERROR_PARSE_MANIFEST,
    ERROR_UPDATING,
    ERROR_DECOMPRESS,
    ALREADY_UP_TO_DATE,
    NEW_VERSION_FOUND,
    UPDATE_FINISHED,
    UPDATE_FAILED,
    UPDATE_PROGRESSION
}

@ccclass
export default class HotUpdate extends cc.Component {

    static State = State;

    @property({
        type: cc.Asset,
        tooltip: '当前版本资源记录的manifest文件'
    })
    manifestUrl: cc.Asset = null;

    @property({
        type: cc.Component.EventHandler,
        tooltip: '检测线上版本与服务器版本的回调'
    })
    checkHandlers: cc.Component.EventHandler[] = [];

    @property({
        type: cc.Component.EventHandler,
        tooltip: '热更新过程回调'
    })
    updateHandlers: cc.Component.EventHandler[] = [];

    state = State.NONE;

    private _updating = false;
    private _canRetry = false;

    private _am = null;

    private _failCount = 0;
    private _totalFilesCount = 0;
    private _totalBytesCount = 0;


    // use this for initialization
    init() {
        // Hot update is only available in Native build
        if (!cc.sys.isNative) {
            return;
        }
        let storagePath = ((jsb.fileUtils ? jsb.fileUtils.getWritablePath() : '/') + 'blackjack-remote-asset');
        cc.log('Storage path for remote asset : ' + storagePath);

        // Setup your own version compare handler, versionA and B is versions in string
        // if the return value greater than 0, versionA is greater than B,
        // if the return value equals 0, versionA equals to B,
        // if the return value smaller than 0, versionA is smaller than B.
        let versionCompareHandle = (versionA, versionB) => {
            cc.log("JS Custom Version Compare: version A is " + versionA + ', version B is ' + versionB);
            let vA = versionA.split('.');
            let vB = versionB.split('.');
            for (let i = 0; i < vA.length; ++i) {
                let a = parseInt(vA[i]);
                let b = parseInt(vB[i] || 0);
                if (a === b) {
                    continue;
                }
                else {
                    return a - b;
                }
            }
            if (vB.length > vA.length) {
                return -1;
            }
            else {
                return 0;
            }
        };

        // Init with empty manifest url for testing custom manifest
        this._am = new jsb.AssetsManager('', storagePath, versionCompareHandle);
        // Setup the verification callback, but we don't have md5 check function yet, so only print some message
        // Return true if the verification passed, otherwise return false
        this._am.setVerifyCallback(function (path, asset) {
            // When asset is compressed, we don't need to check its md5, because zip file have been deleted.
            let compressed = asset.compressed;
            // Retrieve the correct md5 value.
            let expectedMD5 = asset.md5;
            // asset.path is relative path and path is absolute.
            let relativePath = asset.path;
            // The size of asset file, but this value could be absent.
            let size = asset.size;
            if (compressed) {
                cc.log("Verification passed : " + relativePath);
                return true;
            }
            else {
                cc.log("Verification passed : " + relativePath + ' (' + expectedMD5 + ')');
                return true;
            }
        });

        // 'Hot update is ready, please check or directly update.';

        if (cc.sys.os === cc.sys.OS_ANDROID) {
            // Some Android device may slow down the download process when concurrent tasks is too much.
            // The value may not be accurate, please do more test and find what's most suitable for your game.
            // Max concurrent tasks count have been limited to 2
            this._am.setMaxConcurrentTask(2);
        }
    }

    /**
     * 检测线上与服务器的资源版本
     */
    checkUpdate() {
        if (!cc.sys.isNative) {
            cc.Component.EventHandler.emitEvents(this.checkHandlers, this.state);
            return;
        }
        if (this._updating) {
            cc.log('Checking or updating ...');
            return;
        }
        if (this._am.getState() === jsb.AssetsManager.State.UNINITED) {
            // Resolve md5 url
            let url = this.manifestUrl.nativeUrl;
            if (cc.loader.md5Pipe) {
                url = cc.loader.md5Pipe.transformURL(url);
            }
            this._am.loadLocalManifest(url);
        }
        if (!this._am.getLocalManifest() || !this._am.getLocalManifest().isLoaded()) {
            cc.log('Failed to load local manifest ...');
            return;
        }
        this._am.setEventCallback(this.checkUpdateCallback.bind(this));

        this._am.checkUpdate();
        this._updating = true;
    }
    /**
     * 将服务器资源更新到本地
     */
    hotUpdate() {
        if (!cc.sys.isNative) {
            cc.Component.EventHandler.emitEvents(this.updateHandlers, this.state);
            return;
        }
        if (this._am && !this._updating) {
            this._am.setEventCallback(this.hotUpdateCallback.bind(this));

            if (this._am.getState() === jsb.AssetsManager.State.UNINITED) {
                // Resolve md5 url
                let url = this.manifestUrl.nativeUrl;
                if (cc.loader.md5Pipe) {
                    url = cc.loader.md5Pipe.transformURL(url);
                }
                this._am.loadLocalManifest(url);
            }

            this._failCount = 0;
            this._am.update();
            this._updating = true;
        }
    }

    /**
     * 重新下载失败资源
     */
    retry() {
        if (!cc.sys.isNative) {
            return;
        }
        if (!this._updating && this._canRetry) {
            this._canRetry = false;
            // 'Retry failed Assets...';
            this._am.downloadFailedAssets();
        }
    }

    private checkUpdateCallback(event) {
        cc.log('Code: ' + event.getEventCode());
        let logMsg = '';
        switch (event.getEventCode()) {
            case jsb.EventAssetsManager.ERROR_NO_LOCAL_MANIFEST:
                this.state = State.ERROR_NO_LOCAL_MANIFEST;
                break;
            case jsb.EventAssetsManager.ERROR_DOWNLOAD_MANIFEST:
                this.state = State.ERROR_DOWNLOAD_MANIFEST;
                break;
            case jsb.EventAssetsManager.ERROR_PARSE_MANIFEST:
                this.state = State.ERROR_PARSE_MANIFEST;
                break;
            case jsb.EventAssetsManager.ALREADY_UP_TO_DATE:
                this.state = State.ALREADY_UP_TO_DATE;
                break;
            case jsb.EventAssetsManager.NEW_VERSION_FOUND:
                this.state = State.NEW_VERSION_FOUND;
                break;
            default:
                return;
        }

        this._am.setEventCallback(null);
        this._updating = false;

        logMsg = UpdateMsg[this.state];
        cc.log('checkUpdateCallback:', logMsg);
        cc.Component.EventHandler.emitEvents(this.checkHandlers, this.state);

    }

    private hotUpdateCallback(event) {
        let needRestart = false;
        let failed = false;
        let logMsg = '';
        // 字节数下载进度（0-1）
        let percentByByte = 0;
        // 文件数下载进度（0-1）
        let percentByFile = 0;

        let percentByByteStr = '0/0';
        let percentByFileStr = '0/0';

        switch (event.getEventCode()) {
            case jsb.EventAssetsManager.ERROR_NO_LOCAL_MANIFEST:
                this.state = State.ERROR_NO_LOCAL_MANIFEST;
                failed = true;
                break;
            case jsb.EventAssetsManager.UPDATE_PROGRESSION:

                this.state = State.UPDATE_PROGRESSION;

                this._totalFilesCount = event.getTotalFiles();
                this._totalBytesCount = event.getTotalBytes();

                percentByFile = event.getPercentByFile();
                percentByFileStr = event.getDownloadedFiles() + ' / ' + this._totalFilesCount;

                percentByByte = event.getPercent();
                percentByByteStr = event.getDownloadedBytes() + ' / ' + this._totalBytesCount;

                let msg = event.getMessage();
                if (msg) {
                    logMsg = 'Updated file: ' + msg;
                }
                break;
            case jsb.EventAssetsManager.ERROR_DOWNLOAD_MANIFEST:
                this.state = State.ERROR_DOWNLOAD_MANIFEST;
                break;
            case jsb.EventAssetsManager.ERROR_PARSE_MANIFEST:
                this.state = State.ERROR_PARSE_MANIFEST;
                failed = true;
                break;
            case jsb.EventAssetsManager.ALREADY_UP_TO_DATE:
                this.state = State.ALREADY_UP_TO_DATE;
                failed = true;
                break;
            case jsb.EventAssetsManager.UPDATE_FINISHED:
                this.state = State.UPDATE_FINISHED;
                percentByByte = 1;
                percentByFile = 1;
                percentByByteStr = this._totalBytesCount + '/' + this._totalBytesCount;
                percentByFileStr = this._totalFilesCount + '/' + this._totalFilesCount;
                needRestart = true;
                break;
            case jsb.EventAssetsManager.UPDATE_FAILED:
                this.state = State.UPDATE_FAILED;
                this._updating = false;
                this._canRetry = true;
                break;
            case jsb.EventAssetsManager.ERROR_UPDATING:
                this.state = State.ERROR_UPDATING;
                logMsg = 'Asset update error: ' + event.getAssetId() + ', ' + event.getMessage();
                this._failCount++;
                break;
            case jsb.EventAssetsManager.ERROR_DECOMPRESS:
                this.state = State.ERROR_DECOMPRESS;
                logMsg = event.getMessage();
                break;
            default:
                break;
        }

        if (failed) {
            this._am.setEventCallback(null);
            this._updating = false;
        }

        if (needRestart) {
            this._am.setEventCallback(null);

            // Prepend the manifest's search path
            let searchPaths = jsb.fileUtils.getSearchPaths();
            let newPaths = this._am.getLocalManifest().getSearchPaths();

            console.log('new search path:', JSON.stringify(newPaths));

            Array.prototype.unshift.apply(searchPaths, newPaths);
            // This value will be retrieved and appended to the default search path during game startup,
            // please refer to samples/js-tests/main.js for detailed usage.
            // !!! Re-add the search paths in main.js is very important, otherwise, new scripts won't take effect.
            cc.sys.localStorage.setItem('HotUpdateSearchPaths', JSON.stringify(searchPaths));
            jsb.fileUtils.setSearchPaths(searchPaths);

            // 更新完成 重新开始游戏
            cc.log('hotupdate done!');
        }

        // cc.log('hotUpdateCallback:', logMsg ? logMsg : UpdateMsg[this.state]);

        // cc.log('ByteProgress:', percentByByte);
        // cc.log('FileProgress:', percentByFile);

        // cc.log('BytePercent:', percentByByteStr);
        // cc.log('FilePercent:', percentByFileStr);

        cc.Component.EventHandler.emitEvents(this.updateHandlers, this.state, percentByByte, percentByFile, percentByByteStr, percentByFileStr);
    }

    onDestroy() {
        if(cc.sys.isNative && this._am) {
            this._am.setEventCallback(null);
        }
        
    }
}
