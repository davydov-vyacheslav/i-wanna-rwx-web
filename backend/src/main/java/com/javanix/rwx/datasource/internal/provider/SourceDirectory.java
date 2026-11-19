package com.javanix.rwx.datasource.internal.provider;

import com.javanix.rwx.api.model.ResourceType;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * The registered sources: every {@link SourceInfo} bean, in bean order ({@code @Order}), grouped by resource type. The
 * configured default ({@code rwx.datasource.books.default} / {@code .movies.default}, the one every new user gets
 * stored) must be a registered source of its type, else startup fails.
 */
public class SourceDirectory {

    private final Map<ResourceType, List<SourceInfo>> byType;
    private final Map<ResourceType, SourceInfo> defaults = new EnumMap<>(ResourceType.class);

    public SourceDirectory(List<SourceInfo> sources, String bookDefault, String movieDefault) {
        byType = sources.stream().collect(Collectors.groupingBy(SourceInfo::resourceType));
        chooseDefault(ResourceType.BOOK, "books", bookDefault);
        chooseDefault(ResourceType.MOVIE, "movies", movieDefault);
    }

    private void chooseDefault(ResourceType type, String property, String id) {
        var sources = byType.get(type);
        if (sources != null) {
            defaults.put(type, sources.stream().filter(s -> s.id().equals(id)).findFirst()
                    .orElseThrow(() -> new IllegalStateException("rwx.datasource." + property + ".default is '" + id
                            + "', which is not a registered source of " + property)));
        }
    }

    public List<SourceInfo> of(ResourceType type) {
        return byType.getOrDefault(type, List.of());
    }

    /** The list of the type, cast to the source SPI of that resource (checked). */
    public <S extends SourceInfo> List<S> of(ResourceType type, Class<S> as) {
        return of(type).stream().map(as::cast).toList();
    }

    /** The configured default of the type; null only when no source is registered for it. */
    public SourceInfo defaultOf(ResourceType type) {
        return defaults.get(type);
    }

    public Optional<SourceInfo> find(ResourceType type, String id) {
        return of(type).stream().filter(s -> s.id().equals(id)).findFirst();
    }
}
