import { router, useNavigation, type Href } from 'expo-router';

type Params = Record<string, string>;

type State = {
  key?: string;
  routeNames?: string[];
  routes?: { name: string }[];
};

type Nav = {
  getParent: (id?: string) => Nav | undefined;
  getState: () => State;
  navigate: (name: string, params?: Params) => void;
  dispatch: (action: { type: string; target?: string; payload: { name: string; params?: Params } }) => void;
};

type Action = {
  type: string;
  target?: string;
  payload?: { name?: string; params?: Params };
};

/**
 * Sheets such as Settings sit on the `(app)` stack, above the tabs. From a
 * tab, `router.push` asks the tab navigator. On a phone that navigator drops
 * the action instead of handing it to the stack. Deliver it to the navigator
 * whose state key the route belongs to.
 */
export function useOpenStack() {
  const navigation = useNavigation() as unknown as Nav;

  return (name: string, params: Params | undefined, href: Href) => {
    const payload = params && Object.keys(params).length > 0 ? params : undefined;
    const navigators = ancestors(navigation);

    const owner = navigators.find((nav) => registeredName(nav, name));
    // getState() during this press still reports the last commit, so the
    // route list cannot show that the sheet was added. A second attempt
    // after that false miss is the one a phone drops.
    if (owner && dispatchTo(owner, registeredName(owner, name) ?? name, payload)) return;

    const action = actionFor(href);
    if (action?.target) {
      const target = navigators.find((nav) => nav.getState().key === action.target);
      if (target) {
        try {
          target.dispatch(action as Action & { payload: { name: string; params?: Params } });
          return;
        } catch {
          // The targeted dispatch was refused. The href is the last attempt.
        }
      }
    }

    router.navigate(href);
  };
}

/**
 * A tab is not a sheet. On the deck the tab navigator owns Search. On a
 * listing the stack is in front, so the way there is back to `(tabs)` with
 * Search named. `router.navigate` from the listing asks the stack, which
 * does not have that screen.
 */
export function useOpenTab() {
  const navigation = useNavigation() as unknown as Nav;

  return (
    name: 'index' | 'community' | 'messages' | 'search' | 'saved' | 'profile',
    params?: Params,
  ) => {
    const navigators = ancestors(navigation);
    const tabs = navigators.find((nav) => registeredName(nav, name));
    if (tabs) {
      dispatchTo(tabs, registeredName(tabs, name) ?? name, params);
      return;
    }

    const stack = navigators.find((nav) => registeredName(nav, '(tabs)'));
    if (stack) {
      dispatchTo(stack, registeredName(stack, '(tabs)') ?? '(tabs)', {
        screen: name,
        ...(params ?? {}),
      });
      return;
    }

    router.navigate(
      params
        ? ({ pathname: name === 'index' ? '/' : `/${name}`, params } as Href)
        : name === 'index'
          ? '/'
          : `/${name}`,
    );
  };
}

function ancestors(navigation: Nav) {
  const found: Nav[] = [];
  const seen = new Set<Nav>();
  const add = (nav: Nav | undefined) => {
    if (!nav || seen.has(nav)) return;
    seen.add(nav);
    found.push(nav);
  };

  // The layout's id is its path. Settings, the listing, and the other sheets
  // are registered on this one.
  try {
    add(navigation.getParent('/(app)'));
  } catch {
    // The id is absent. The walk below still climbs every parent.
  }

  let current: Nav | undefined = navigation;
  while (current && !seen.has(current)) {
    add(current);
    try {
      current = current.getParent();
    } catch {
      break;
    }
  }
  return found;
}

function registeredName(nav: Nav, name: string) {
  let names: string[] = [];
  try {
    names = nav.getState().routeNames ?? [];
  } catch {
    return undefined;
  }
  return names.find((routeName) => routeName === name || routeName.endsWith(`/${name}`));
}

function dispatchTo(nav: Nav, name: string, params: Params | undefined) {
  let key: string | undefined;
  try {
    key = nav.getState().key;
  } catch {
    return false;
  }
  if (!key || typeof nav.dispatch !== 'function') return false;
  try {
    nav.dispatch({
      type: 'NAVIGATE',
      target: key,
      payload: params ? { name, params } : { name },
    });
  } catch {
    return false;
  }
  return true;
}

function actionFor(href: Href): Action | undefined {
  if (typeof href !== 'string') return undefined;
  try {
    // Same path parsing `router.push` uses, so the screen name and the
    // navigator key match what a working push would have targeted.
    const { getNavigateAction } = require('expo-router/build/global-state/getNavigationAction') as {
      getNavigateAction: (href: string, options: object, type: string) => Action | undefined;
    };
    return getNavigateAction(href, {}, 'NAVIGATE');
  } catch {
    return undefined;
  }
}
