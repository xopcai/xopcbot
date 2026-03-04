// Router - Simple declarative routing for Lit
// Inspired by Vue Router but adapted for Web Components

export interface Route {
  path: string;
  component?: string;
  beforeEnter?: (to: RouteLocation, from: RouteLocation | null) => boolean | Promise<boolean>;
  children?: Route[];
}

export interface RouteLocation {
  path: string;
  fullPath: string;
  params: Record<string, string>;
  query: Record<string, string>;
  hash: string;
}

export interface RouterOptions {
  routes: Route[];
  base?: string;
}

type RouteChangeListener = (to: RouteLocation, from: RouteLocation | null) => void;

export class Router {
  private _routes: Route[];
  private _base: string;
  private _currentRoute: RouteLocation | null = null;
  private _listeners: Set<RouteChangeListener> = new Set();
  private _beforeEachGuards: Array<(to: RouteLocation, from: RouteLocation | null) => boolean | Promise<boolean>> = [];

  constructor(options: RouterOptions) {
    this._routes = options.routes;
    this._base = options.base || '';
    this._init();
  }

  private _init(): void {
    // Listen to hash changes
    window.addEventListener('hashchange', () => {
      this._handleRouteChange();
    });

    // Initial route
    this._handleRouteChange();
  }

  private _handleRouteChange(): void {
    const hash = location.hash.slice(1) || '/';
    this.navigate(hash);
  }

  async navigate(path: string): Promise<boolean> {
    const from = this._currentRoute;
    const to = this._resolveRoute(path);

    if (!to) {
      console.warn(`[Router] No route matched for: ${path}`);
      return false;
    }

    // Run beforeEach guards
    for (const guard of this._beforeEachGuards) {
      const result = await guard(to, from);
      if (result === false) {
        console.log('[Router] Navigation cancelled by guard');
        return false;
      }
    }

    // Run route-specific beforeEnter
    const matchedRoute = this._matchRoute(path);
    if (matchedRoute?.beforeEnter) {
      const result = await matchedRoute.beforeEnter(to, from);
      if (result === false) {
        console.log('[Router] Navigation cancelled by route guard');
        return false;
      }
    }

    this._currentRoute = to;

    // Notify listeners
    this._listeners.forEach(listener => listener(to, from));

    return true;
  }

  private _resolveRoute(path: string): RouteLocation | null {
    const matched = this._matchRoute(path);
    if (!matched) return null;

    const params = this._extractParams(matched.path, path);
    const query = this._parseQuery(path);
    const hash = this._extractHash(path);

    return {
      path: matched.path,
      fullPath: path,
      params,
      query,
      hash
    };
  }

  private _matchRoute(path: string): Route | null {
    for (const route of this._routes) {
      if (this._isMatch(route.path, path)) {
        return route;
      }
    }
    return null;
  }

  private _isMatch(routePath: string, actualPath: string): boolean {
    // Remove query and hash for matching
    const cleanPath = actualPath.split('?')[0].split('#')[0];
    
    // Convert route pattern to regex
    const pattern = routePath
      .replace(/\//g, '\\/')
      .replace(/:([^/]+)/g, '([^/]+)');
    
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(cleanPath);
  }

  private _extractParams(routePath: string, actualPath: string): Record<string, string> {
    const params: Record<string, string> = {};
    const cleanPath = actualPath.split('?')[0].split('#')[0];
    
    const routeParts = routePath.split('/');
    const pathParts = cleanPath.split('/');

    routeParts.forEach((part, index) => {
      if (part.startsWith(':')) {
        const paramName = part.slice(1);
        params[paramName] = decodeURIComponent(pathParts[index] || '');
      }
    });

    return params;
  }

  private _parseQuery(path: string): Record<string, string> {
    const query: Record<string, string> = {};
    const queryIndex = path.indexOf('?');
    
    if (queryIndex === -1) return query;

    const queryString = path.slice(queryIndex + 1).split('#')[0];
    const pairs = queryString.split('&');

    pairs.forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) {
        query[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    });

    return query;
  }

  private _extractHash(path: string): string {
    const hashIndex = path.indexOf('#');
    return hashIndex !== -1 ? path.slice(hashIndex + 1) : '';
  }

  beforeEach(guard: (to: RouteLocation, from: RouteLocation | null) => boolean | Promise<boolean>): void {
    this._beforeEachGuards.push(guard);
  }

  onRouteChange(listener: RouteChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  get currentRoute(): RouteLocation | null {
    return this._currentRoute;
  }

  push(path: string): void {
    location.hash = path;
  }

  replace(path: string): void {
    history.replaceState(null, '', `#${path}`);
    this._handleRouteChange();
  }
}

// Singleton instance
let routerInstance: Router | null = null;

export function createRouter(options: RouterOptions): Router {
  routerInstance = new Router(options);
  return routerInstance;
}

export function useRouter(): Router {
  if (!routerInstance) {
    throw new Error('[Router] Router not initialized. Call createRouter first.');
  }
  return routerInstance;
}

// Decorator for route-aware components
export function routeAware(target: any) {
  return class extends target {
    private _unsubscribe?: () => void;

    connectedCallback() {
      super.connectedCallback?.();
      
      try {
        const router = useRouter();
        this._unsubscribe = router.onRouteChange((to, from) => {
          if (this.onRouteChange) {
            this.onRouteChange(to, from);
          }
        });
      } catch (e) {
        // Router not initialized yet
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback?.();
      this._unsubscribe?.();
    }
  };
}

export interface RouteAware {
  onRouteChange?(to: RouteLocation, from: RouteLocation | null): void;
}
