## 1、将 [version_generator.js](https://github.com/Jonle/Cocos-Hotupdate/blob/master/version_generator.js)复制到项目根目录。

## 2、修改version_generator.js文件中的配置
 ### "packageUrl" : 远程资源的本地缓存根路径
### "remoteVersionUrl" : 远程版本文件的路径，用来判断服务器端是否有新版本的资源
### "remoteManifestUrl" : 远程资源 Manifest 文件的路径，包含版本信息以及所有资源信息
### "version" :   资源的版本

## 3、修改构建结果路径及热更文件路径

## 4、[hot-update](https://github.com/Jonle/Cocos-Hotupdate/tree/master/hot-update)插件文件夹放到packages目录下


## 5、添加[热更组件](https://github.com/Jonle/Cocos-Hotupdate/blob/master/HotUpdate.ts)到项目里，根据需求自行调整逻辑。
## 6、热更新逻辑处理完之后，构建版本，注意：version_generator.js配置要对应构建模板的配置

## 7、在项目根目录执行 node .\version_generator.js -v 1.0.0
### -v 指定 Manifest 文件的主版本号

## 8、将生成的project.manifest文件拖到Cocos Creator里，此为基础热更新版本

## 9、如果版本内容更新以后，需要线上版本进行热更新，则需重新构建，再执行第6步，并升级版本号。将对应版本的文件及文件夹放到服务器。
