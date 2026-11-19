/**
 * Module "datasource": pluggable data sources per type (books, movies and TV), their registries and the
 * server-side resolution of a source URL into a normalized item. Published API is this package:
 * {@link com.javanix.rwx.datasource.MediaResolver} (injected parameterized, {@code MediaResolver<BookRef, BookItem>}
 * or {@code MediaResolver<MovieRef, MovieItem>}), the refs and item records, and the {@link com.javanix.rwx.datasource.CatalogException} family. The source SPI, the registries, the HTTP
 * foundation and the key and default controllers are internal, split into {@code internal.book}, {@code internal.movie},
 * {@code internal.provider} (depends on neither of the two) and {@code internal.web}. {@code media} depends on this
 * module, never the other way round.
 */
@ApplicationModule(displayName = "Data sources", allowedDependencies = {"identity", "settings", "common", "api"})
package com.javanix.rwx.datasource;

import org.springframework.modulith.ApplicationModule;
