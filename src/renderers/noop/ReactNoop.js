/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactNoop
 * @flow
 */

/**
 * This is a renderer of React that doesn't have a render target output.
 * It is useful to demonstrate the internals of the reconciler in isolation
 * and for testing semantics of reconciliation separate from the host
 * environment.
 */

'use strict';

import type { Fiber } from 'ReactFiber';
import type { UpdateQueue } from 'ReactFiberUpdateQueue';
import type { HostChildren } from 'ReactFiberReconciler';

var ReactFiberReconciler = require('ReactFiberReconciler');
var {
  AnimationPriority,
} = require('ReactPriorityLevel');

var scheduledAnimationCallback = null;
var scheduledDeferredCallback = null;

const TERMINAL_TAG = 99;
const TEXT_TAG = 98;

type Container = { rootID: number, children: Array<Instance | TextInstance> };
type Props = { prop: any };
type Instance = { tag: 99, type: string, id: number, children: Array<Instance | TextInstance>, prop: any };
type TextInstance = { tag: 98, text: string };

var instanceCounter = 0;

function recursivelyAppendChildren(flatArray : Array<Instance | TextInstance>, child : HostChildren<Instance | TextInstance>) {
  if (!child) {
    return;
  }
  if (child.tag === TERMINAL_TAG || child.tag === TEXT_TAG) {
    flatArray.push(child);
  } else {
    let node = child;
    do {
      recursivelyAppendChildren(flatArray, node.output);
    } while (node = node.sibling);
  }
}

function flattenChildren(children : HostChildren<Instance | TextInstance>) {
  const flatArray = [];
  recursivelyAppendChildren(flatArray, children);
  return flatArray;
}

var NoopRenderer = ReactFiberReconciler({

  updateContainer(containerInfo : Container, children : HostChildren<Instance | TextInstance>) : void {
    containerInfo.children = flattenChildren(children);
  },

  createInstance(type : string, props : Props, children : HostChildren<Instance | TextInstance>) : Instance {
    const inst = {
      tag: TERMINAL_TAG,
      id: instanceCounter++,
      type: type,
      children: flattenChildren(children),
      prop: props.prop,
    };
    // Hide from unit tests
    Object.defineProperty(inst, 'tag', { value: inst.tag, enumerable: false });
    Object.defineProperty(inst, 'id', { value: inst.id, enumerable: false });
    return inst;
  },

  prepareUpdate(instance : Instance, oldProps : Props, newProps : Props) : boolean {
    return true;
  },

  commitUpdate(instance : Instance, oldProps : Props, newProps : Props) : void {
    instance.prop = newProps.prop;
  },

  createTextInstance(text : string) : TextInstance {
    var inst = { tag: TEXT_TAG, text : text };
    // Hide from unit tests
    Object.defineProperty(inst, 'tag', { value: inst.tag, enumerable: false });
    return inst;
  },

  commitTextUpdate(textInstance : TextInstance, oldText : string, newText : string) : void {
    textInstance.text = newText;
  },

  appendChild(parentInstance : Instance, child : Instance | TextInstance) : void {
    const index = parentInstance.children.indexOf(child);
    if (index !== -1) {
      parentInstance.children.splice(index, 1);
    }
    parentInstance.children.push(child);
  },

  insertBefore(parentInstance : Instance, child : Instance | TextInstance, beforeChild : Instance | TextInstance) : void {
    const index = parentInstance.children.indexOf(child);
    if (index !== -1) {
      parentInstance.children.splice(index, 1);
    }
    const beforeIndex = parentInstance.children.indexOf(beforeChild);
    if (beforeIndex === -1) {
      throw new Error('This child does not exist.');
    }
    parentInstance.children.splice(beforeIndex, 0, child);
  },

  removeChild(parentInstance : Instance, child : Instance | TextInstance) : void {
    const index = parentInstance.children.indexOf(child);
    if (index === -1) {
      throw new Error('This child does not exist.');
    }
    parentInstance.children.splice(index, 1);
  },

  scheduleAnimationCallback(callback) {
    scheduledAnimationCallback = callback;
  },

  scheduleDeferredCallback(callback) {
    scheduledDeferredCallback = callback;
  },

});

var rootContainer = { rootID: 0, children: [] };

var root = null;

var ReactNoop = {

  root: rootContainer,

  render(element : ReactElement<any>) {
    if (!root) {
      root = NoopRenderer.mountContainer(element, rootContainer);
    } else {
      NoopRenderer.updateContainer(element, root);
    }
  },

  flushAnimationPri() {
    var cb = scheduledAnimationCallback;
    if (cb === null) {
      return;
    }
    scheduledAnimationCallback = null;
    cb();
  },

  flushDeferredPri(timeout : number = Infinity) {
    var cb = scheduledDeferredCallback;
    if (cb === null) {
      return;
    }
    scheduledDeferredCallback = null;
    var timeRemaining = timeout;
    cb({
      timeRemaining() {
        // Simulate a fix amount of time progressing between each call.
        timeRemaining -= 5;
        if (timeRemaining < 0) {
          timeRemaining = 0;
        }
        return timeRemaining;
      },
    });
  },

  flush() {
    ReactNoop.flushAnimationPri();
    ReactNoop.flushDeferredPri();
  },

  performAnimationWork(fn: Function) {
    NoopRenderer.performWithPriority(AnimationPriority, fn);
  },

  // Logs the current state of the tree.
  dumpTree() {
    if (!root) {
      console.log('Nothing rendered yet.');
      return;
    }

    var bufferedLog = [];
    function log(...args) {
      bufferedLog.push(...args, '\n');
    }

    function logHostInstances(children: Array<Instance | TextInstance>, depth) {
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.tag === TEXT_TAG) {
          log('  '.repeat(depth) + '- ' + child.text);
        } else {
          log('  '.repeat(depth) + '- ' + child.type + '#' + child.id);
          logHostInstances(child.children, depth + 1);
        }
      }
    }
    function logContainer(container : Container, depth) {
      log('  '.repeat(depth) + '- [root#' + container.rootID + ']');
      logHostInstances(container.children, depth + 1);
    }

    function logUpdateQueue(updateQueue : UpdateQueue, depth) {
      log(
        '  '.repeat(depth + 1) + 'QUEUED UPDATES',
        updateQueue.isReplace ? 'is replace' : '',
        updateQueue.isForced ? 'is forced' : ''
      );
      log(
        '  '.repeat(depth + 1) + '~',
        updateQueue.partialState,
        updateQueue.callback ? 'with callback' : ''
      );
      var next;
      while (next = updateQueue.next) {
        log(
          '  '.repeat(depth + 1) + '~',
          next.partialState,
          next.callback ? 'with callback' : ''
        );
      }
    }

    function logFiber(fiber : Fiber, depth) {
      log(
        '  '.repeat(depth) + '- ' + (fiber.type ? fiber.type.name || fiber.type : '[root]'),
        '[' + fiber.pendingWorkPriority + (fiber.pendingProps ? '*' : '') + ']'
      );
      if (fiber.updateQueue) {
        logUpdateQueue(fiber.updateQueue, depth);
      }
      const childInProgress = fiber.progressedChild;
      if (childInProgress && childInProgress !== fiber.child) {
        log('  '.repeat(depth + 1) + 'IN PROGRESS: ' + fiber.progressedPriority);
        logFiber(childInProgress, depth + 1);
        if (fiber.child) {
          log('  '.repeat(depth + 1) + 'CURRENT');
        }
      } else if (fiber.child && fiber.updateQueue) {
        log('  '.repeat(depth + 1) + 'CHILDREN');
      }
      if (fiber.child) {
        logFiber(fiber.child, depth + 1);
      }
      if (fiber.sibling) {
        logFiber(fiber.sibling, depth);
      }
    }

    log('HOST INSTANCES:');
    logContainer(rootContainer, 0);
    log('FIBERS:');
    logFiber((root.stateNode : any).current, 0);

    console.log(...bufferedLog);
  },

};

module.exports = ReactNoop;
