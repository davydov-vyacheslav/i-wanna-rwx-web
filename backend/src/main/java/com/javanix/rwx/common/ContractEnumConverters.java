package com.javanix.rwx.common;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Set;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.TypeDescriptor;
import org.springframework.core.convert.converter.ConditionalGenericConverter;
import org.springframework.format.FormatterRegistry;
import org.springframework.util.ReflectionUtils;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Path and query parameters that are generated contract enums. The generator gives them lowercase wire values
 * ({@code movie}, {@code open_library}) and a static {@code fromValue}, while Spring's default converter matches the
 * Java constant name ({@code MOVIE}); without this every such parameter would be a 400. An unknown value makes the
 * generated factory throw, which {@link ProblemAdvice} answers as 400 {@code validation}.
 */
@Configuration(proxyBeanMethods = false)
class ContractEnumConverters implements WebMvcConfigurer {

    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverter(new FromValueConverter());
    }

    static final class FromValueConverter implements ConditionalGenericConverter {

        @Override
        public Set<ConvertiblePair> getConvertibleTypes() {
            return Set.of(new ConvertiblePair(String.class, Enum.class));
        }

        @Override
        public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
            return fromValue(targetType.getType()) != null;
        }

        @Override
        public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
            return ReflectionUtils.invokeMethod(fromValue(targetType.getType()), null, source);
        }

        private static Method fromValue(Class<?> type) {
            var method = ReflectionUtils.findMethod(type, "fromValue", String.class);
            return method != null && Modifier.isStatic(method.getModifiers()) ? method : null;
        }
    }
}
