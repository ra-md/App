import type {ParamListBase, PartialState, RouterConfigOptions} from '@react-navigation/native';
import {StackRouter} from '@react-navigation/native';
import Onyx from 'react-native-onyx';
import getIsNarrowLayout from '@libs/getIsNarrowLayout';
import type {PlatformStackNavigationState, PlatformStackRouterOptions} from '@libs/Navigation/PlatformStackNavigation/types';
import * as PolicyUtils from '@libs/PolicyUtils';
import ONYXKEYS from '@src/ONYXKEYS';
import SCREENS from '@src/SCREENS';

type StackState = PlatformStackNavigationState<ParamListBase> | PartialState<PlatformStackNavigationState<ParamListBase>>;

const isAtLeastOneInState = (state: StackState, screenName: string): boolean => state.routes.some((route) => route.name === screenName);

let isLoadingReportData = true;
Onyx.connect({
    key: ONYXKEYS.IS_LOADING_REPORT_DATA,
    initWithStoredValues: false,
    callback: (value) => (isLoadingReportData = value ?? false),
});

function adaptStateIfNecessary(state: StackState) {
    const isNarrowLayout = getIsNarrowLayout();
    const workspaceCentralPane = state.routes.at(-1);
    const policyID =
        workspaceCentralPane?.params && 'policyID' in workspaceCentralPane.params && typeof workspaceCentralPane.params.policyID === 'string'
            ? workspaceCentralPane.params.policyID
            : undefined;
    const policy = PolicyUtils.getPolicy(policyID ?? '');
    const isPolicyAccessible = PolicyUtils.isPolicyAccessible(policy);

    // There should always be WORKSPACE.INITIAL screen in the state to make sure go back works properly if we deeplinkg to a subpage of settings.
    // The only exception is when the workspace is invalid or inaccessible.
    if (!isAtLeastOneInState(state, SCREENS.WORKSPACE.INITIAL)) {
        if (isNarrowLayout && !isLoadingReportData && !isPolicyAccessible) {
            return;
        }
        // @ts-expect-error Updating read only property
        // noinspection JSConstantReassignment
        state.stale = true; // eslint-disable-line

        // This is necessary for ts to narrow type down to PartialState.
        if (state.stale === true) {
            // Unshift the root screen to fill left pane.
            state.routes.unshift({
                name: SCREENS.WORKSPACE.INITIAL,
                params: workspaceCentralPane?.params,
            });
        }
    }

    // If the screen is wide, there should be at least two screens inside:
    // - WORKSPACE.INITIAL to cover left pane.
    // - WORKSPACE.PROFILE (first workspace settings screen) to cover central pane.
    if (!isNarrowLayout) {
        if (state.routes.length === 1 && state.routes.at(0)?.name === SCREENS.WORKSPACE.INITIAL) {
            // @ts-expect-error Updating read only property
            // noinspection JSConstantReassignment
            state.stale = true; // eslint-disable-line
            // Push the default settings central pane screen.
            if (state.stale === true) {
                state.routes.push({
                    name: SCREENS.WORKSPACE.PROFILE,
                    params: state.routes.at(0)?.params,
                });
            }
        }
        // eslint-disable-next-line no-param-reassign, @typescript-eslint/non-nullable-type-assertion-style
        (state.index as number) = state.routes.length - 1;
    }
}

function CustomFullScreenRouter(options: PlatformStackRouterOptions) {
    const stackRouter = StackRouter(options);

    return {
        ...stackRouter,
        getInitialState({routeNames, routeParamList, routeGetIdList}: RouterConfigOptions) {
            const initialState = stackRouter.getInitialState({routeNames, routeParamList, routeGetIdList});
            adaptStateIfNecessary(initialState);

            // If we needed to modify the state we need to rehydrate it to get keys for new routes.
            if (initialState.stale) {
                return stackRouter.getRehydratedState(initialState, {routeNames, routeParamList, routeGetIdList});
            }

            return initialState;
        },
        getRehydratedState(partialState: StackState, {routeNames, routeParamList, routeGetIdList}: RouterConfigOptions): PlatformStackNavigationState<ParamListBase> {
            adaptStateIfNecessary(partialState);
            const state = stackRouter.getRehydratedState(partialState, {routeNames, routeParamList, routeGetIdList});
            return state;
        },
    };
}

export default CustomFullScreenRouter;
