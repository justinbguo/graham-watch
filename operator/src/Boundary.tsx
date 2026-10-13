import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Turns a render crash into a message instead of a black screen.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which on this app's dark background looks exactly like the page failing to
 * load — no error, nothing to click, and the console is the only place the
 * reason exists. One shop's catalogue table must not be able to do that.
 *
 * A class because that is still the only way to catch a render error; there is
 * no hook equivalent in React 19.
 */
type Props = { children: ReactNode; what: string };
type State = { failed: Error | null };

export class Boundary extends Component<Props, State> {
  state: State = { failed: null };

  static getDerivedStateFromError(failed: Error): State {
    return { failed };
  }

  componentDidCatch(failed: Error, info: ErrorInfo) {
    // The stack is worth more than the message for a render crash, and the
    // panel below has room for neither.
    console.error(`${this.props.what} crashed`, failed, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="panel">
        <p className="error">
          {this.props.what} could not be drawn: {this.state.failed.message}
        </p>
        <p className="muted small">
          The browser console has the stack. This is usually the import function
          being older than this console — redeploy it and reload.
        </p>
        <button className="ghost" onClick={() => this.setState({ failed: null })}>
          Try again
        </button>
      </div>
    );
  }
}
