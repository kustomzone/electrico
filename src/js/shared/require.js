(function() {
    let JS_EXT = [".js", ".cjs", ".json"];
    JS_EXT.isExtension = (path) => {
        return JS_EXT.includes(path.substring(path.lastIndexOf(".")));
    }
    window.__init_require = function (window) {
        window.__dirname="";
        //console.trace("__init_require call", window);
        
        let loader = (function() {
            function normalize(path) {
                let npath=[];
                for (let p of path.split("/")) {
                    if (p==".") continue;
                    if (p==".." && npath.length>0) {
                        npath.pop();
                    } else {
                        npath.push(p);
                    }
                }
                let rpath = npath.join("/");
                //console.log(path, rpath);
                return rpath;
            }
            function resolveNodeModulesPath(path) {
                let ix = path.lastIndexOf("/");
                if (ix<0) return null;
                let spath = path.substring(0, ix);
                let nmpath = spath+"/node_modules";
                let fs = require("fs");
                if (fs.existsSync(nmpath)) {
                    return nmpath;
                }
                return resolveNodeModulesPath(spath);
            }
            let pendingXHRCnt = 0;
            function performXHRRequest(url, async) {
                if (async) {
                    return new Promise((resolve, reject)=>{
                        let req = new XMLHttpRequest();
                        req.open("GET", url, true);
                        req.onload = function () {
                            pendingXHRCnt--;
                            resolve(req);
                            if (pendingXHRCnt==0 && window.__electrico.asyncImportDoneHook!=null) {
                                window.__electrico.asyncImportDoneHook();
                                delete window.__electrico.asyncImportDoneHook;
                            }
                        };
                        req.onerror = function(err) {
                            console.error("asyncXHRRequest onerror", err);
                            pendingXHRCnt--;
                            reject(err);
                        }
                        pendingXHRCnt++;
                        req.send();
                    });
                } else {
                    return {
                        then:(cb)=>{
                            let req = new XMLHttpRequest();
                            req.open("GET", url, false);
                            req.send();
                            return cb(req);
                        }
                    }
                }
            }
            let moduleContext = {
                _load: (request, parent, isMain) => {
                    return null;
                },
                _resolveLookupPaths: (request, parent) => {
                    return request;
                },
                createRequire: (file) => {
                    return require;
                },
                register: (script, path) => {
                    //let scr = atob(script.split(",")[1]);
                }
            };
            
            function loadElectricoLib(pathparts) {
                if (pathparts[0].length>0 && !pathparts[0].startsWith(".")) {
                    let lib = window.__electrico.getLib(pathparts[0], __electrico_nonce);
                    if (lib!=null) {
                        for (let p of pathparts.slice(1, pathparts.length)) {
                            lib=lib[p];
                            if (lib==null) return null;
                        }
                        return lib;
                    }
                }
                return null;
            }

            function expandModulePath(_this, mpath) {
                let module_path = _this!=null?_this.__import_mpath:"";
                if (mpath.startsWith(".")) {
                    expanded_path=module_path.length>0?module_path+"/"+mpath:mpath;
                } else if (mpath.startsWith("/")) {
                    expanded_path=mpath;
                } else {
                    let node_modules_base = (_this!=null && _this.node_modules_path!=null)?_this.node_modules_path:"node_modules";
                    expanded_path=node_modules_base+"/"+mpath;
                }
                return normalize(expanded_path);
            }
            function fromCache(key) {
                if (window.__electrico.module_cache.has(key)) {
                    let val = window.__electrico.module_cache.get(key);
                    return val.deref!=null?val.deref():val;
                }
                return null;
            }
            function circularImport(ctx) {
                let ctxp = ctx;
                while (ctxp.parent!=null) {
                    ctxp = ctxp.parent;
                    if (ctxp.__filename==ctx.__filename) {
                        ctxp.circular = ctxp.circular || [];
                        ctxp.circular.push(ctx);
                        ctx.lib={};
                        return new Proxy({}, {
                            get(target, prop, receiver) {
                                return ctx.lib[prop];
                            }
                        });
                    }
                }
                return null;
            }
            function resolveCircular(ctx, exported) {
                if (ctx.circular!=null) {
                    for (let cctx of ctx.circular) {
                        cctx.lib=exported;
                    }
                }
            }
            const registry = new FinalizationRegistry((key) => {
                if (!window.__electrico.module_cache.get(key)?.deref()) {
                    window.__electrico.module_cache.delete(key);
                }
            })
            const asyncPending = {};
            function handleCache(cacheKey, exported) {
                let pending = fromCache(cacheKey);
                window.__electrico.module_cache.set(cacheKey, new WeakRef(exported));
                registry.register(exported, cacheKey);

                if (pending!=null && pending.pending===asyncPending) {
                    pending.loadCallbacks.forEach(cb => {
                        cb(exported);
                    });
                }
                return exported;
            }
            function evalModuleScript(_this, mpath, cacheKey, expanded_path, script, async) {
                var module = {exports:{__default:{}}}; var exports = {__electrico_deferred:[], __default:{}};
                exports.export = function(selector) {
                    let parts = selector.split(",");
                    let toEval="";
                    for (let i=0; i<parts.length; i++) {
                        let vparts = parts[i].split(" as ");
                        if (vparts.length==1) {
                            toEval += "exports['"+vparts[0].trim()+"']="+vparts[0].trim()+";";
                        } else {
                            toEval += "exports['"+vparts[1].trim()+"']="+vparts[0].trim()+";";
                        }
                    }
                    return toEval;
                };
                var __e_exports = function(d) {
                    if (d=="") return exports;
                    return exports.__default;
                };
                if (mpath.endsWith(".json")) {
                    return handleCache(cacheKey, JSON.parse(script));
                } else {
                    let node_modules_path = null;
                    if (_this==null && window.__dirname!="") {
                        node_modules_path = resolveNodeModulesPath(expanded_path.startsWith("/")?expanded_path:window.__dirname+expanded_path);
                    }
                    
                    let __import_mpath = expanded_path.substring(0, expanded_path.lastIndexOf("/"));
                    let __dirname = __import_mpath.startsWith(window.__dirname)?__import_mpath:window.__dirname+"/"+__import_mpath;
                    let __Import_meta = {url:expanded_path.startsWith(window.__dirname)?expanded_path:window.__dirname+"/"+expanded_path};
                    let _this2 = {"parent": _this, "__import_mpath":__import_mpath, "__filename":__Import_meta.url, "node_modules_path": _this!=null?_this.node_modules_path:null};
                    let __filename = __Import_meta.url;
                    if (node_modules_path!=null) _this2.node_modules_path=node_modules_path;

                    let circular = circularImport(_this2);
                    if (circular!=null) {
                        return circular;
                    }

                    let sourceURL = "//# sourceURL="+expanded_path+"\n";
                    script = window.__replaceImports(script);
                    script = sourceURL+"(async function(){\nlet __require_this=_this2;let __electrico_import={nr:0,prom:[],toEval:''};"+script+"\n})()";
                    function afterEval() {
                        if (exports.__electrico_deferred!=null) {
                            for (let def of exports.__electrico_deferred) {
                                def();
                            }
                            delete exports.__electrico_deferred;
                        }
                        let exported = (module.exports!=null && ((typeof module.exports=="function") || ((Object.keys(module.exports).length>0 && module.exports.__default==null) || (Object.keys(module.exports).length>1 && module.exports.__default!=null))))?module.exports:exports;
                        for (let k in exported.__default) {
                            exported[k] = exported.__default[k];
                        }
                        resolveCircular(_this2, exported);
                        return handleCache(cacheKey, exported);
                    }
                    if (async) {
                        return eval(script).catch((e)=>{
                            console.error("import async error", expanded_path, script, e);
                            throw e;
                        }).then(()=>{
                            return afterEval();
                        });
                    } else {
                        try {
                            eval(script);
                        } catch (e) {
                            console.error("import sync error", expanded_path, script, e);
                            throw e;
                        }
                        return afterEval();
                    }
                }
            }
            function loadModuleFromPackage(_this, mpath, cacheKey, expanded_mod_path, expanded_path, mpathparts, submodpath, packageJson, async) {
                let libMainPath;
                if (packageJson!=null) {
                    let package = JSON.parse(packageJson);
                    let submodsel = submodpath!=null?"./"+submodpath:".";
                    let submodvar = submodpath!=null?submodpath:"default";
                    libMainPath = package.main!=null?package.main:(package.exports!=null?(package.exports.default!=null?package.exports.default:((package.exports[submodsel]!=null && package.exports[submodsel][submodvar]!=null)?package.exports[submodsel][submodvar]:package.exports)):(package.files!=null?package.files.filter(f=>{return f.endsWith(".js") || f.endsWith(".json")})[0]:null));
                } else {
                    libMainPath = "index.js";
                    if (expanded_path.endsWith(".js")) {
                        expanded_mod_path=expanded_path.substring(0, expanded_path.lastIndexOf("."));
                    }
                }
                expanded_path = expanded_mod_path+"/"+libMainPath;
                
                if (!JS_EXT.isExtension(expanded_path)) expanded_path+=".js";
                expanded_path = normalize(expanded_path);
                let libfilepath = window.__create_protocol_url(window.__create_file_url("electrico-mod/"+expanded_path));
                return performXHRRequest(libfilepath, async).then((xhrLib)=>{
                    if (xhrLib.status!=301) {
                        return evalModuleScript(_this, mpath, cacheKey, expanded_path, xhrLib.responseText, async);
                    }
                    if (mpathparts.length>1) {
                        let module = loadModule(_this, mpathparts.slice(0, mpathparts.length-1).join("/"), mpathparts[mpathparts.length-1], async);
                        if (module!=null) {
                            return module;
                        }
                    }
                    if (_this!=null && _this.node_modules_path!=null) {
                        console.log("not found in node_modules_path, trying default node_modules", mpath);
                        delete _this.node_modules_path;
                        return loadModule(_this, mpath, null, async);
                    }
                    console.error("js file not found", libfilepath);
                    return null;
                });
            }
             
            function loadModule(_this, mpath, submodpath, async) {
                if (mpath=="module" || mpath=="node:module") {
                    return moduleContext;
                }
                if (mpath.endsWith(".node")) {
                    mpath=mpath.substring(mpath.lastIndexOf("/")+1, mpath.length);
                }
                let mpathparts = mpath.split("/");
                let electricoLib = loadElectricoLib(mpathparts);
                if (electricoLib!=null) {
                    return electricoLib;
                }
                let moduleLooaderLib = moduleContext._load(mpath, {"filename":_this!=null?_this.__filename:null}, false);
                if (moduleLooaderLib!=null) {
                    return moduleLooaderLib;
                }
                let expanded_mod_path = expandModulePath(_this, mpath);
                let cacheKey =  expanded_mod_path+(submodpath!=null?"/"+submodpath:"");
                let cachedLib = fromCache(cacheKey);
                if (cachedLib!=null && cachedLib.pending===asyncPending) {
                    return new Promise((resolve, reject) => {
                        cachedLib.loadCallbacks.push((lib)=>{
                            resolve(lib);
                        });
                    });
                }
                if (cachedLib!=null) {
                    return cachedLib;
                }
                if (async) {
                    window.__electrico.module_cache.set(cacheKey, {
                        pending:asyncPending,
                        loadCallbacks: []
                    });
                }
                let expanded_path = JS_EXT.isExtension(expanded_mod_path)?expanded_mod_path:expanded_mod_path+".js";  
                let libfilepath = window.__create_protocol_url(window.__create_file_url("electrico-mod/"+expanded_path));
                return performXHRRequest(libfilepath, async).then((xhrLib)=>{
                    if (xhrLib.status!=301) {
                        return evalModuleScript(_this, mpath, cacheKey, expanded_path, xhrLib.responseText, async);
                    }
                    let package_path = window.__create_protocol_url(window.__create_file_url("electrico-mod/"+expanded_mod_path+"/package.json"));
                    return performXHRRequest(package_path, async).then((xhrPackageTry1)=>{
                        if (xhrPackageTry1.status!=301) {
                            return loadModuleFromPackage(_this, mpath, cacheKey, expanded_mod_path, expanded_path, mpathparts, submodpath, xhrPackageTry1.responseText, async);
                        }
                        expanded_mod_path+=".js";
                        package_path = window.__create_protocol_url(window.__create_file_url("electrico-mod/"+expanded_mod_path+"/package.json"));
                        return performXHRRequest(package_path, async).then((xhrPackageTry2)=>{
                            if (xhrPackageTry2.status!=301) {
                                return loadModuleFromPackage(_this, mpath, cacheKey, expanded_mod_path, expanded_path, mpathparts, submodpath, xhrPackageTry2.responseText, async);
                            }
                            console.log("no package.json", mpath, package_path);
                            return loadModuleFromPackage(_this, mpath, cacheKey, expanded_mod_path, expanded_path, mpathparts, submodpath, null, async);
                        });
                    });
                });
            }
            return {
                loadModule:loadModule
            }
        })();

        let IMPORT_ASYNC=true;
        window.__Import=async function(_this, __electrico_import, selector, mpath, doExport, exports) {
            //console.log("__import", mpath, selector);
            let mod = await loader.loadModule(_this, mpath, null, true);
            __electrico_import.nr++;
            let modid = "mod"+__electrico_import.nr;
            __electrico_import[modid] = mod;
            let toEval="";
            if (selector!=null) {
                selector = selector.trim();
                let vlnames = false;
                if (selector.startsWith("{") && selector.endsWith("}")) {
                    vlnames = true;
                    selector = selector.substring(1, selector.length-1);
                }
                let parts = selector.split(",");
                for (let i=0; i<parts.length; i++) {
                    let part = parts[i];
                    let vparts = part.split(" as ");
                    let vname = null; let vlname = null;
                    if (vparts.length>1) {
                        vlname =  vparts[0];
                        vname = vparts[1];
                    } else {
                        vname = vparts[0];
                        vlname = vparts[0];
                        if (!vlnames && parts.length==1) {
                            if (mod==null) {
                                console.warn("mod null:", mpath);
                            } else if (mod.__default !=null && Object.keys(mod.__default).length==1) {
                                vlname =  Object.keys(mod.__default)[0];
                                vlnames = true;
                            }
                        }
                    }
                    vlname=vlname.trim();
                    vname=vname.trim();
                    if (vname.length==0) {
                        console.warn("__Import vlname empty", mpath, selector)
                        continue;
                    }
                    if (doExport) {
                        vname = "exports['"+vname+"']";
                    }
                    if (vlnames) {
                        toEval+=((doExport?"":"var ")+vname+"="+"__electrico_import['"+modid+"']['"+vlname+"'];");
                    } else {
                        toEval+=((doExport?"":"var ")+vname+"="+"__electrico_import['"+modid+"'];");
                    }
                }
            }
            __electrico_import.toEval+=toEval;
        }
        window.__importinline=function(__require_this, mpath) {
            return new Promise((resolve, reject) => {
                let mod = loader.loadModule(__require_this, mpath);
                if (mod==null) {
                    reject();
                } else {
                    resolve(mod);
                }
            });
        }
        window.require=function(__require_this, mpath) {
            if (mpath==null) {
                mpath = __require_this;
                __require_this=null;
            }
            let mod = loader.loadModule(__require_this, mpath);
            return mod;
        }
        
        window.__replaceImports = (script) => {
            script = ("\n"+script+"\n").replaceAll(/([;,\r,\n])const( +)exports( *)=(.*)/g, ";exports =$4");
            script = script.replaceAll(/([;,\r,\n])import (.*) from [',"](.*)[',"][;,\r,\n]/g, "$1__electrico_import.prom.push(__Import(__require_this, __electrico_import, '$2', '$3'));");
            script = script.replaceAll(/([;,\r,\n])import [',"](.*)[',"][;,\r,\n]/g, ";$1__electrico_import.prom.push(__Import(__require_this, __electrico_import, null, '$2'));");
            script = script.replaceAll("import.meta", "__Import_meta");
            script = script.replaceAll("import(", "__importinline(__require_this, ");
            script = script.replaceAll("require(", "require(__require_this, ");
            script = script.replaceAll(/([;,\r,\n])export (.*) from [',"](.*)[',"][;,\r,\n]/g, ";$1__electrico_import.prom.push(__Import(__require_this, __electrico_import, '$2', '$3', true, exports));");

            script = script.replaceAll(/\export +{ *([^{ ,;,\n,}}]*) *} *;/g, "exports['$1']=$1;");
            let export_try_deferred = "var $3={}; try {exports['$3']=$3$4;} catch (e) {}; if (exports.__electrico_deferred!=null) exports.__electrico_deferred.push(function(){if (exports['$3']==null || (Object.keys(exports['$3']).length === 0 && exports['$3'].constructor === Object)) exports['$3']=$3$4;});";

            script = script.replaceAll(/\export +(var ) *(([^{ ,;,\n}]*))(.*);/g, export_try_deferred);
            script = script.replaceAll(/\export +(let ) *(([^{ ,;,\n}]*))(.*);/g, export_try_deferred);
            script = script.replaceAll(/\export +(const ) *(([^{ ,;,\n}]*))(.*);/g, export_try_deferred);

            script = script.replaceAll(/[ ,\r,\n,;]export +(default)?(const)?(var)?(let)? *{([^}]*)} *;/g,"eval(__e_exports('$1').export('$5'));");
            script = script.replaceAll(/[ ,\r,\n,;]export +(default )?(const )?(var )?(let )? *(([^{ ,;,\n}]*))(.*);/g,"__e_exports('$1')['$6']=$6$7;");
            script = script.replaceAll(/\export +(default)?(const)? *((async +function)?(function)?(function\*)?(async +function\*)?(class)? +([^{ ,(,;,\n}]*))/g, "__e_exports('$1')['$9']=$9=$3");
            script = script.replaceAll(/[\r,\n] *}[\r,\n] *\(function/g, "\n};\n(function"); // Color

            let ix = script.lastIndexOf("__electrico_import.prom.push(__Import(__require_this,");
            if (ix>=0) {
                ix = script.indexOf(";", ix)+1;
                script = script.substring(0, ix)+"\n"+(IMPORT_ASYNC?"await Promise.all(__electrico_import.prom); ":"")+"eval(__electrico_import.toEval);"+script.substring(ix);
            }
            
            let sourcemapspattern = "sourceMappingURL=data:application/json;base64,";
            let smix = script.indexOf(sourcemapspattern);
            if (smix>=0) {
                try {
                    let sourcemaps = JSON.parse(atob(script.substring(smix+sourcemapspattern.length)));
                    if (sourcemaps.sourceRoot!=null && sourcemaps.sourceRoot.startsWith("file://")) {
                        sourcemaps.sourceRoot = window.__create_protocol_url(window.__create_file_url("electrico-mod/"+sourcemaps.sourceRoot.substring(7)));
                        //script = script.substring(0, smix+sourcemapspattern.length)+btoa(JSON.stringify(sourcemaps));
                        script = script.substring(0, smix+sourcemapspattern.length);
                    }
                } catch (e) {}
            }
            return script;
        }
    };
})();