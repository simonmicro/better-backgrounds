const Applet = imports.ui.applet;
const AppletManager = imports.ui.appletManager;
const Soup = imports.gi.Soup;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Tweener = imports.ui.tweener;
const PopupMenu = imports.ui.popupMenu;

const uuid = "better-backgrounds@simonmicro";
const appletPath = AppletManager.appletMeta[uuid].path;
const imagePath = appletPath + '/background';

function log(msg) {
    global.log('[' + uuid + '] ' + msg);
};

class UnsplashBackgroundApplet extends Applet.IconApplet {
    constructor(orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);

        //Init the menu on applet click, which is opened if applet is click with no bg change
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);
        this.menuBtnChangeBack = new PopupMenu.PopupMenuItem('Change background');
        this.menuBtnSavePic = new PopupMenu.PopupMenuItem('Save current picture');
        this.menuBtnChangeBack.connect('activate', imports.lang.bind(this, this._change_background));
        this.menuBtnSavePic.connect('activate', imports.lang.bind(this, this._store_background));
        this.menu.addMenuItem(this.menuBtnChangeBack);
        this.menu.addMenuItem(this.menuBtnSavePic);

        this.settings = new imports.ui.settings.AppletSettings(this, uuid, instance_id);

        this.settings.bind("applet-icon-animation", "applet_icon_animation", this.on_settings_changed);
        this.settings.bind("applet-show-notification", "applet_show_notification", this.on_settings_changed);
        this.settings.bind("change-onstart", "change_onstart", this.on_settings_changed);
        this.settings.bind("change-onclick", "change_onclick", this.on_settings_changed);
        this.settings.bind("change-ontime", "change_ontime", this.on_settings_changed);
        this.settings.bind("change-time", "change_time", this.on_settings_changed);
        this.settings.bind("effect-select", "effect_select", this.on_settings_changed);
        this.settings.bind("image-source", "image_source", this.on_settings_changed);
        this.settings.bind("image-res-manual", "image_res_manual", this.on_settings_changed);
        this.settings.bind("image-res-width", "image_res_width", this.on_settings_changed);
        this.settings.bind("image-res-height", "image_res_height", this.on_settings_changed);
        this.settings.bind("image-uri", "image_uri", this.on_settings_changed);
        this.settings.bind("image-tag", "image_tag", this.on_settings_changed);
        this.settings.bind("image-tag-data", "image_tag_data", this.on_settings_changed);

        this.set_applet_icon_name("applet");
        this.httpAsyncSession = new Soup.SessionAsync();
        Soup.Session.prototype.add_feature.call(this.httpAsyncSession, new Soup.ProxyResolverDefault());

        this.on_settings_changed();

        if(this.change_onstart)
            this._change_background();
    }

    _timeout_update() {
        if(this.change_ontime)
            this._timeout_enable();
        else
            this._timeout_disable();
    }

    _timeout_disable() {
        if (this._timeout)
            imports.mainloop.source_remove(this._timeout);
        this._timeout = null;
    }

    _timeout_enable() {
        this._timeout_disable();
        this._timeout = imports.mainloop.timeout_add_seconds(this.change_time * 60, imports.lang.bind(this, this._auto_change_background));
    }

    _set_icon_opacity(newValue) {
        if(this.applet_icon_animation)
            Tweener.addTween(this._applet_icon, {
                opacity: newValue,
                time: 0.8
            });
    }

    _icon_animate() {
        this._icon_opacity = this._icon_opacity == 0 ? 255 : 0;
        this._set_icon_opacity(this._icon_opacity);
        //And queue next step...
        this._animator = imports.mainloop.timeout_add_seconds(1, imports.lang.bind(this, this._icon_animate));
    }

    _icon_start() {
        //Start animation and ensure no other is running (anymore)...
        this._icon_stop();
        this._animator = imports.mainloop.timeout_add_seconds(1, imports.lang.bind(this, this._icon_animate));
    }

    _icon_stop() {
        //Abort queued step
        if(this._animator)
            imports.mainloop.source_remove(this._animator);
        this._animator = null;
        //And fade back to normal
        this._set_icon_opacity(255);
    }

    _auto_change_background() {
        //Updates the background and then retriggers the timeout for this...
        this._change_background();
        this._timeout_update();
    }

    _change_background() {
        this._icon_start();
        this.image_copyright = null;
        let that = this;
        let defaultEnd = function() {
            that._icon_stop();
        };

        if(this.image_source == 'cutycapt') {
            let resStr = '';
            if(this.image_res_manual)
                resStr = ' --min-width=' + this.image_res_width + ' --min-height=' + this.image_res_height;
            let cmdStr = 'cutycapt --out-format=png --url="' + this.image_uri + '" --out="' + imagePath + '"' + resStr;
            this._run_cmd(cmdStr);
            defaultEnd();
        } else if(this.image_source == 'bing') {
            log('Downloading bing metadata');
            let request = Soup.Message.new('GET', 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mbl=1');
            this.httpAsyncSession.queue_message(request, function(http, msg) {
                if (msg.status_code === 200) {
                    let jsonData = JSON.parse(msg.response_body.data).images[0];
                    that.image_copyright = jsonData.title + ' - ' + jsonData.copyright;
                    that._update_tooltip();
                    that._download_image('https://www.bing.com' + jsonData.url).then(defaultEnd);
                } else
                    that._show_notification('Could not download bing metadata!');
            });
        } else if(this.image_source == 'himawari') {
            log('Downloading himawari metadata');
/*                {
                //Download metadata and read latest timestamp
                let request = Soup.Message.new('GET', 'https://himawari8-dl.nict.go.jp/himawari8/img/D531106/latest.json');
                this.httpSyncSession.send_message(request);

                if (request.status_code !== 200)
                    this._show_notification('Could not download himawari metadata!');
                else {
                    let latestDate = new Date(JSON.parse(request.response_body.data).date);
                    let zoomLvl = 1; //1, 4, 8, 16, 20
                    let tileNames = Array();

                    //Download all tiles
                    for(let x = 0; x < zoomLvl; x++) {
                        for(let y = 0; y < zoomLvl; y++) {
                            let tileName = appletPath + '/tile_' + x + '_' + y;
                            this._download_image('https://himawari8-dl.nict.go.jp/himawari8/img/D531106/' +
                                zoomLvl + 'd/550/' + latestDate.getFullYear() + '/' + ('0' + latestDate.getMonth()).slice(-2) + 
                                '/' + ('0' + latestDate.getDate()).slice(-2) + '/' + ('0' + latestDate.getHours()).slice(-2) +
                                ('0' + latestDate.getMinutes()).slice(-2) + ('0' + latestDate.getSeconds()).slice(-2) + '_' +
                                y + '_' + x + '.png', tileName);
                            tileNames.push(tileName);
                        }
                    }

                    //Trigger imagemagick to merge the tiles
                    let cmdStr = 'montage ';
                    tileNames.forEach((tileName) => {cmdStr += '"' + tileName + '" ';});
                    cmdStr += '-geometry 550x550+0+0 -tile ' + zoomLvl + 'x' + zoomLvl;
                    cmdStr += ' "' + imagePath + '"';
                    this._run_cmd(cmdStr);

                    //Cleanup the tiles from buffer
                    tileNames.forEach((tileName) => {that._run_cmd('rm -fv "' + tileName + '"');});
                }
            }*/
        } else if(this.image_source == 'unsplash') {
            let resStr = 'featured';
            if(this.image_res_manual)
                resStr = this.image_res_width + 'x' + this.image_res_height;
            let tagStr = '';
            if(this.image_tag)
                tagStr = '?' + this.image_tag_data;
            this._download_image('https://source.unsplash.com/' + resStr + '/' + tagStr).then(defaultEnd);
        } else if(this.image_source == 'placekitten') {
            let resStr = '1920/1080';
            if(this.image_res_manual)
                resStr = this.image_res_width + '/' + this.image_res_height;
            this._download_image('http://placekitten.com/' + resStr).then(defaultEnd);
        } else if(this.image_source == 'picsum') {
            let resStr = '1920/1080';
            if(this.image_res_manual)
                resStr = this.image_res_width + '/' + this.image_res_height;
            this._download_image('https://picsum.photos/' + resStr).then(defaultEnd);
        }
    }

    _run_cmd(cmdStr) {
        log('Running: ' + cmdStr);
        imports.ui.main.Util.spawnCommandLine(cmdStr);
    }

    _store_background() {
        //Copy the background to users picture folder with random name and show the stored notification
        let targetPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) + '/' + Math.floor(Math.random() * 2048) + '.png';
        this._run_cmd('convert "' + imagePath + '" -write "' + targetPath + '"');

        this._show_notification('Image stored to: ' + targetPath);
    }

    _apply_image() {
        //Now apply any effect (if selected)
        switch(this.effect_select) {
            case 'grayscale':
                imports.ui.main.Util.spawnCommandLine('mogrify -grayscale average ' + imagePath);
            break;
            case 'gaussian-blur':
                imports.ui.main.Util.spawnCommandLine('mogrify -gaussian-blur 40 ' + imagePath);
            break;
            default:
                //Just ignore any invalid option...
        }

        //Update gsettings
        let gSetting = new Gio.Settings({schema: 'org.cinnamon.desktop.background'});
        gSetting.set_string('picture-uri', 'file://' + imagePath);
        Gio.Settings.sync();
        gSetting.apply();
    }

    _download_image(uri, targetPath = imagePath) {
        log('Downloading image ' + uri);
        let gFile = Gio.file_new_for_path(targetPath);
        let fStream = gFile.replace(null, false, Gio.FileCreateFlags.NONE, null);
        let request = Soup.Message.new('GET', uri);
        let that = this;

        request.connect('got_chunk', function(message, chunk) {
            if (message.status_code === 200)
                fStream.write(chunk.get_data(), null);
        });

        return new Promise(function(resolve, reject) {
            that.httpAsyncSession.queue_message(request, function(http, msg) {
                fStream.close(null);
                if (msg.status_code !== 200) {
                    that._show_notification('Could not download image!');
                    reject();
                }
                resolve();
            });
        });
    }

    _update_tooltip() {
        let tooltipStr = '';
        if(this.change_onstart)
            tooltipStr += 'Background changed on last startup';
        if(this.change_onstart && (this.change_onclick || this.change_ontime))
            tooltipStr += "\n";
        if(this.change_onclick)
            tooltipStr += 'Click here to change background';
        if(this.change_ontime && this.change_onclick)
            tooltipStr += "\n";
        if(this.change_ontime)
            tooltipStr += 'Every ' + this.change_time + ' minutes the background changes itself';
        if(this.change_ontime && this.image_copyright !== null)
            tooltipStr += "\n\n";
        if(this.image_copyright !== null)
            tooltipStr += this.image_copyright;
        if(!this.change_ontime && !this.change_onclick)
            tooltipStr += 'No action defined! Please enable at least on in the configuration!';
        this.set_applet_tooltip(_(tooltipStr));
    }

    _show_notification(text) {
        if(this.applet_show_notification)
            imports.ui.main.notify('Better Backgrounds', text);
    }

    on_settings_changed() {
        this._update_tooltip();
        this._timeout_update();
    }

    on_applet_clicked() {
        if(this.change_onclick)
            this._change_background();
        else
            this.menu.toggle();
    }

    on_applet_removed_from_panel() {
        this.settings.finalize();
        this._timeout_disable();
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new UnsplashBackgroundApplet(orientation, panel_height, instance_id);
}
