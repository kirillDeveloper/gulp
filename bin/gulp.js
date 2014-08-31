#!/usr/bin/env node

'use strict';
var nomnom = require('nomnom');
var gutil = require('gulp-util');
var chalk = require('chalk');
var semver = require('semver');
var Liftoff = require('liftoff');
var tildify = require('tildify');
var interpret = require('interpret');
var cliOptions = require('../lib/cliOptions');
var completion = require('../lib/completion');
var taskTree = require('../lib/taskTree');

// logging functions
var logTasks = require('../lib/log/tasks');
var logEvents = require('../lib/log/events');
var logTasksSimple = require('../lib/log/tasksSimple');

// set env var for ORIGINAL cwd
// before anything touches it
process.env.INIT_CWD = process.cwd();

var cli = new Liftoff({
  name: 'gulp',
  completions: completion,
  extensions: interpret.jsVariants
});

var cliPackage = require('../package.json');
var opts = nomnom
  .script('gulp-next')
  .options(cliOptions)
  .parse();
var tasks = opts._;
var toRun = tasks.length ? tasks : ['default'];

// this is a hold-over until we have a better logging system
// with log levels
var shouldLog = !opts.silent && !opts.tasksSimple;

if (!shouldLog) {
  gutil.log = function(){};
}

// wire up a few err listeners to liftoff
cli.on('require', function (name) {
  gutil.log('Requiring external module', chalk.magenta(name));
});

cli.on('requireFail', function (name) {
  gutil.log(chalk.red('Failed to load external module'), chalk.magenta(name));
});

cli.launch({
  cwd: opts.cwd,
  configPath: opts.gulpfile,
  require: opts.require,
  completion: opts.completion
}, handleArguments);

// the actual logic
function handleArguments(env) {
  if (opts.version) {
    gutil.log('CLI version', cliPackage.version);
    if (env.modulePackage) {
      gutil.log('Local version', env.modulePackage.version);
    }
    process.exit(0);
  }

  if (!env.modulePath) {
    gutil.log(
      chalk.red('Local gulp not found in'),
      chalk.magenta(tildify(env.cwd))
    );
    gutil.log(chalk.red('Try running: npm install gulp'));
    process.exit(1);
  }

  if (!env.configPath) {
    gutil.log(chalk.red('No gulpfile found'));
    process.exit(1);
  }

  // check for semver difference between cli and local installation
  if (semver.gt(cliPackage.version, env.modulePackage.version)) {
    gutil.log(chalk.red('Warning: gulp version mismatch:'));
    gutil.log(chalk.red('Global gulp is', cliPackage.version));
    gutil.log(chalk.red('Local gulp is', env.modulePackage.version));
  }

  // chdir before requiring gulpfile to make sure
  // we let them chdir as needed
  if (process.cwd() !== env.cwd) {
    process.chdir(env.cwd);
    gutil.log(
      'Working directory changed to',
      chalk.magenta(tildify(env.cwd))
    );
  }

  var gulpInst = require(env.modulePath);
  logEvents(gulpInst);

  if (opts.tasks) {
    var getTree = taskTree(gulpInst);
  }

  // this is what actually loads up the gulpfile
  require(env.configPath);

  process.nextTick(function () {
    if (opts.tasksSimple) {
      return logTasksSimple(env, gulpInst);
    }
    if (opts.tasks) {
      return logTasks(getTree(), env);
    }
    try {
      gutil.log('Using gulpfile', chalk.magenta(tildify(env.configPath)));
      // TODO: do we care about the error/result from calling this?
      gulpInst.parallel(toRun)();
    } catch (err) {
      gutil.log(chalk.red(err.message));
      gutil.log(
        'Please check the documentation for proper gulpfile formatting'
      );
      process.exit(1);
    }
  });
}

