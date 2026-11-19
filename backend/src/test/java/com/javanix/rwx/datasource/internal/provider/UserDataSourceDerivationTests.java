package com.javanix.rwx.datasource.internal.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.javanix.rwx.api.model.ResourceType;
import com.javanix.rwx.datasource.internal.provider.UserDataSourceService.SourceState;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;

/** The derived state of one list (design 16.2), over every combination a user's rows can produce. Pure: no database. */
class UserDataSourceDerivationTests {

    private static final SourceInfo FREE = new StubSource(ResourceType.BOOK, "free", false);
    private static final SourceInfo KEYED = new StubSource(ResourceType.BOOK, "keyed", true);
    private static final SourceInfo KEYED2 = new StubSource(ResourceType.BOOK, "keyed2", true);

    /** {@code chosen}: the stored default's source id (null: no row); {@code saved}: ids with a saved key. */
    private static List<SourceState> derive(List<SourceInfo> sources, String chosen, String... saved) {
        return derive(sources.isEmpty() ? null : sources.getFirst(), sources, chosen, saved);
    }

    private static List<SourceState> derive(SourceInfo configuredDefault, List<SourceInfo> sources, String chosen,
            String... saved) {
        return UserDataSourceService.derive(sources, configuredDefault, chosen, Set.of(saved));
    }

    private static String only(List<SourceState> states, Predicate<SourceState> flag) {
        var ids = states.stream().filter(flag).map(s -> s.source().id()).toList();
        assertThat(ids).as("exactly one").hasSize(1);
        return ids.getFirst();
    }

    private static String theDefault(List<SourceState> s) {
        return only(s, SourceState::isDefault);
    }

    private static String effective(List<SourceState> s) {
        return only(s, SourceState::isEffective);
    }

    @Test
    void noRowsFallsBackToTheConfiguredDefaultWhichIsEffectiveWhenItNeedsNoKey() {
        var states = derive(List.of(FREE, KEYED), null);

        assertThat(theDefault(states)).isEqualTo("free");
        assertThat(effective(states)).isEqualTo("free");
        assertThat(states.get(0).available()).isTrue();
        assertThat(states.get(1).available()).isFalse();
        assertThat(states).noneMatch(SourceState::tokenSaved);
    }

    @Test
    void aFirstSourceThatNeedsAKeyIsDefaultAndEffectiveEvenWhenUnavailable() {
        var states = derive(List.of(KEYED), null);

        assertThat(theDefault(states)).isEqualTo("keyed");
        assertThat(effective(states)).as("nothing available: the default itself").isEqualTo("keyed");
        assertThat(states.getFirst().available()).isFalse();
    }

    @Test
    void anAvailableDefaultThatIsNotFirstIsEffective() {
        var states = derive(List.of(FREE, KEYED), "keyed", "keyed");

        assertThat(theDefault(states)).isEqualTo("keyed");
        assertThat(effective(states)).isEqualTo("keyed");
    }

    @Test
    void anUnavailableDefaultFallsBackToTheFirstAvailableAndTheChoiceIsKept() {
        // the row keeps the choice after the key was deleted
        var states = derive(List.of(KEYED2, FREE, KEYED), "keyed");

        assertThat(theDefault(states)).as("stored choice unchanged").isEqualTo("keyed");
        assertThat(effective(states)).isEqualTo("free");
    }

    @Test
    void whenNothingIsAvailableTheDefaultIsEffective() {
        var states = derive(List.of(KEYED, KEYED2), "keyed2");

        assertThat(theDefault(states)).isEqualTo("keyed2");
        assertThat(effective(states)).isEqualTo("keyed2");
    }

    @Test
    void aSavedKeyWithoutADefaultMakesThatSourceAvailableButNotTheDefault() {
        var states = derive(List.of(FREE, KEYED), null, "keyed");

        assertThat(theDefault(states)).isEqualTo("free");
        assertThat(effective(states)).isEqualTo("free");
        var keyed = states.get(1);
        assertThat(keyed.tokenSaved()).isTrue();
        assertThat(keyed.available()).isTrue();
    }

    @Test
    void anExplicitDefaultOfTheFirstSourceBehavesLikeTheImplicitOne() {
        var states = derive(List.of(FREE, KEYED), "free");

        assertThat(theDefault(states)).isEqualTo("free");
        assertThat(effective(states)).isEqualTo("free");
    }

    @Test
    void theConfiguredDefaultNeedNotBeTheFirstSource() {
        var states = derive(KEYED, List.of(FREE, KEYED), null);

        assertThat(theDefault(states)).isEqualTo("keyed");
        assertThat(effective(states)).as("the default is unavailable").isEqualTo("free");
    }

    @Test
    void theStoredDefaultWinsOverTheConfiguredOne() {
        var states = derive(KEYED, List.of(FREE, KEYED), "free");

        assertThat(theDefault(states)).isEqualTo("free");
    }

    @Test
    void storedIdsOfAnUnregisteredSourceAreIgnored() {
        var states = derive(List.of(FREE, KEYED), "gone", "gone2");

        assertThat(theDefault(states)).as("falls back to the configured default").isEqualTo("free");
        assertThat(states).extracting(s -> s.source().id()).containsExactly("free", "keyed");
    }

    @Test
    void aKeyOfASourceThatNeedsNoKeyIsNotACreditedKey() {
        var states = derive(List.of(FREE), null, "free");

        assertThat(states.getFirst().tokenSaved()).isFalse();
    }

    @Test
    void anEmptyListHasNoStates() {
        assertThat(derive(List.of(), null)).isEmpty();
    }
}
