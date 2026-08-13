#import <AppKit/AppKit.h>
#import <objc/runtime.h>

#include <node_api.h>

@interface ErnieNaturalScrollEvent : NSProxy {
  __strong NSEvent *_event;
}

- (instancetype)initWithEvent:(NSEvent *)event;

@end

@implementation ErnieNaturalScrollEvent

- (instancetype)initWithEvent:(NSEvent *)event {
  _event = event;
  return self;
}

- (NSPoint)locationInWindow {
  return _event.locationInWindow;
}

- (CGFloat)scrollingDeltaX {
  return -_event.scrollingDeltaX;
}

- (CGFloat)scrollingDeltaY {
  return -_event.scrollingDeltaY;
}

- (BOOL)hasPreciseScrollingDeltas {
  return _event.hasPreciseScrollingDeltas;
}

- (NSMethodSignature *)methodSignatureForSelector:(SEL)selector {
  return [_event methodSignatureForSelector:selector];
}

- (void)forwardInvocation:(NSInvocation *)invocation {
  [invocation invokeWithTarget:_event];
}

@end

typedef void (*ScrollWheelImplementation)(id, SEL, NSEvent *);

static ScrollWheelImplementation original_scroll_wheel = NULL;

static void NaturalScrollWheel(id receiver, SEL selector, NSEvent *event) {
  ErnieNaturalScrollEvent *natural_event =
      [[ErnieNaturalScrollEvent alloc] initWithEvent:event];
  original_scroll_wheel(receiver, selector, (NSEvent *)natural_event);
}

static napi_value InstallNaturalScrolling(napi_env environment,
                                          napi_callback_info callback_info) {
  (void)callback_info;
  Class metal_view = objc_getClass("NodeLynxMetalView");
  if (metal_view == Nil) {
    napi_throw_error(environment, NULL,
                     "NodeLynxMetalView is unavailable after node-lynx startup");
    return NULL;
  }

  Method scroll_wheel = class_getInstanceMethod(metal_view, @selector(scrollWheel:));
  if (scroll_wheel == NULL) {
    napi_throw_error(environment, NULL,
                     "NodeLynxMetalView does not expose scrollWheel:");
    return NULL;
  }

  IMP current = method_getImplementation(scroll_wheel);
  if (current != (IMP)NaturalScrollWheel) {
    original_scroll_wheel = (ScrollWheelImplementation)current;
    method_setImplementation(scroll_wheel, (IMP)NaturalScrollWheel);
  }

  napi_value installed;
  napi_get_boolean(environment, true, &installed);
  return installed;
}

static napi_value Initialize(napi_env environment, napi_value exports) {
  napi_value install;
  napi_create_function(environment, "installNaturalScrolling", NAPI_AUTO_LENGTH,
                       InstallNaturalScrolling, NULL, &install);
  napi_set_named_property(environment, exports, "installNaturalScrolling", install);
  return exports;
}

NAPI_MODULE(lynx_natural_scroll, Initialize)
