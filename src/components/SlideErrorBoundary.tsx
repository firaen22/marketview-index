import { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    resetKey: string;
}

interface State {
    hasError: boolean;
}

export class SlideErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="text-slate-400 text-sm flex items-center justify-center h-full">
                    Slide rendering failed / 投影片渲染失敗
                </div>
            );
        }

        return this.props.children;
    }
}
