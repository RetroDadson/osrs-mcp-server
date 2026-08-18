use crate::error::ApiError;
use regex::Regex;
use std::sync::LazyLock;

#[cfg(test)]
mod valid_name_tests {
    use super::*;

    #[test]
    fn valid_names() {
        let valid_names = [
            "test",
            "with space",
            "with 1234",
            "123",
            "with-dash",
            "dash-and space",
            "CAPITAL LETTERS",
            "MiXeD case-123",
            "0123456789",
            "underscore_name",
            " space",
            "space ",
        ];

        for name in valid_names {
            assert!(valid_name(name), "{} should have been a valid name", name);
        }
    }

    #[test]
    fn invalid_names() {
        let invalid_names = [
            "@SHARED",
            "invalid!",
            "@",
            "-=+[];'./,<>?\"\\|`~",
            "=",
            "+",
            "[",
            "]",
            ";",
            "'",
            ".",
            "/",
            ",",
            "<",
            ">",
            "?",
            "\"",
            "\\",
            "|",
            "`",
            "~",
            "",
            " ",
            "                 ",
        ];

        for name in invalid_names {
            assert!(
                !valid_name(name),
                "{} should have been an invalid name",
                name
            );
        }
    }
}

#[cfg(test)]
mod string_length_tests {
    use super::*;

    #[test]
    fn within_bounds_ok() {
        assert!(validate_string_length("task", "Abyssal demons", 100).is_ok());
    }

    #[test]
    fn exact_max_ok() {
        assert!(validate_string_length("task", "12345", 5).is_ok());
    }

    #[test]
    fn exceeds_max_errors() {
        let result = validate_string_length("task", "123456", 5);
        assert!(result.is_err());
    }

    #[test]
    fn empty_string_ok() {
        assert!(validate_string_length("task", "", 5).is_ok());
    }

    #[test]
    fn optional_none_ok() {
        assert!(validate_optional_string_length("master", &None, 5).is_ok());
    }

    #[test]
    fn optional_some_within_bounds_ok() {
        assert!(validate_optional_string_length("master", &Some("Duradel".to_string()), 50).is_ok());
    }

    #[test]
    fn optional_some_exceeds_max_errors() {
        let result =
            validate_optional_string_length("master", &Some("x".repeat(51)), 50);
        assert!(result.is_err());
    }
}

static NAME_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new("[^A-Za-z 0-9-_]").unwrap());

pub fn valid_name(name: &str) -> bool {
    let len = name.len();
    (1..=16).contains(&len) && name.is_ascii() && !NAME_RE.is_match(name) && !name.trim().is_empty()
}

pub enum ArrayFormat {
    Flat,
    ItemPairs,
}

pub fn validate_string_length(prop_name: &str, value: &str, max_len: usize) -> Result<(), ApiError> {
    if value.len() > max_len {
        return Err(ApiError::GroupMemberValidationError(format!(
            "{} length {} exceeds max {}",
            prop_name,
            value.len(),
            max_len
        )));
    }
    Ok(())
}

pub fn validate_optional_string_length(
    prop_name: &str,
    value: &Option<String>,
    max_len: usize,
) -> Result<(), ApiError> {
    match value {
        Some(s) => validate_string_length(prop_name, s, max_len),
        None => Ok(()),
    }
}

pub fn validate_member_prop_length<T>(
    prop_name: &str,
    value: &Option<Vec<T>>,
    min: usize,
    max: usize,
    format: ArrayFormat,
) -> Result<(), ApiError> {
    let Some(x) = value else {
        return Ok(());
    };
    let len = x.len();
    if !(min..=max).contains(&len) {
        return Err(ApiError::GroupMemberValidationError(format!(
            "{} length violated range constraint {}..={} actual={}",
            prop_name, min, max, len
        )));
    }
    if matches!(format, ArrayFormat::ItemPairs) && len % 2 != 0 {
        return Err(ApiError::GroupMemberValidationError(format!(
            "{} must have an even number of elements (item-id/quantity pairs), got {}",
            prop_name, len
        )));
    }
    Ok(())
}
